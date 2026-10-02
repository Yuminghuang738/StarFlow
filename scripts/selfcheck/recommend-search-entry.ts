// 推荐链路自检（PR 4）：不依赖 GUI、不需要 GitHub Token，全部走 Mock 模式 + 纯函数断言。
//
// 跑法：node scripts/selfcheck/recommend-search.mjs
//
// 覆盖：
//   1) escapeQualifier / buildQuery —— 这是"让 AI 出计划"这套方案安全的关键护栏，
//      用户输入或模型输出里的 : " , 换行都不能变成查询语法
//   2) parseSearchPlan —— 正常 JSON / 围栏 / 夹杂解释文字 / 垃圾输入 / 类型不对 / 缺关键词
//   3) searchPlanPrompt 是纯函数，且带上了用户原句
//   4) planSearch 在 Mock 模式下返回 null 且不发请求（AI 未配置时整条链路要照常工作）
//   5) forQuery / similar 的 Mock 端到端：空串返回空、排除已 Star、不发网络请求
//   6) github.star 的 Mock 分支：幂等，重复 Star 不会造出第二条记录
import * as github from '../../src/main/github'
import * as recommend from '../../src/main/recommend'
import * as ai from '../../src/main/ai'
import * as store from '../../src/main/store'
import { searchPlanPrompt, parseSearchPlan } from '../../src/main/ai-prompts'
import type { SearchPlan } from '../../src/main/ai-prompts'
import type { Repo } from '@shared/types'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

/** 造一条最小的 Repo。画像只看 language / topics / ai_category / stargazers_count 四个字段 */
let seq = 0
function mkRepo(over: Partial<Repo> = {}): Repo {
  seq += 1
  return {
    id: seq,
    full_name: `owner/repo-${seq}`,
    description: null,
    language: null,
    stargazers_count: 100,
    html_url: `https://github.com/owner/repo-${seq}`,
    starred_at: '2026-01-15T00:00:00.000Z',
    topics: [],
    pushed_at: null,
    latest_release: null,
    ...over
  }
}

async function main(): Promise<void> {
  console.log(`== 场景：MOCK_MODE=${process.env.MOCK_MODE} ==\n`)

  // ---------- 1) escapeQualifier / buildQuery ----------
  console.log('=== 1) escapeQualifier / buildQuery：查询串拼接护栏 ===')
  check(
    'escapeQualifier 剥掉 : " , ( ) 换行',
    recommend.escapeQualifier('a:b "c" d,e\nf(g)') === 'a b c d e f g',
    recommend.escapeQualifier('a:b "c" d,e\nf(g)')
  )
  check('escapeQualifier 压缩连续空白', recommend.escapeQualifier('  a   b ') === 'a b')

  const injected = recommend.buildQuery(null, 'rust:language "x" terminal,editor')
  check('原句里的冒号/引号/逗号进不了语法层', !/[:",]/.test(injected), injected)

  const plan: SearchPlan = {
    keywords: 'ocr: chinese',
    language: 'TypeScript',
    topic: 'machine-learning',
    minStars: 500
  }
  const q = recommend.buildQuery(plan, '随便什么原句')
  check('有计划时按计划拼（关键词 + language + topic + stars）', q === 'ocr chinese language:TypeScript topic:machine-learning stars:>=500', q)
  check('有计划时原句不参与拼接', !q.includes('随便什么原句'))
  check(
    '模型给的脏值同样被清洗（引号剥掉后不会拼出非法语法）',
    recommend.buildQuery({ keywords: 'a', language: 'Ty"pe', topic: null, minStars: null }, 'x') ===
      'a language:Ty pe'
  )
  check(
    'minStars 为 null 时不加 stars 限定',
    recommend.buildQuery({ keywords: 'k', language: null, topic: null, minStars: null }, 'x') === 'k'
  )
  check('plan 为 null 时退回清洗后的原句', recommend.buildQuery(null, '离线 OCR') === '离线 OCR')
  check('全是标点时拼出空串（不会发空查询）', recommend.buildQuery(null, ':::') === '')

  // ---------- 2) parseSearchPlan ----------
  console.log('\n=== 2) parseSearchPlan：各种脏输出都不能抛错 ===')
  const ok = parseSearchPlan('{"keywords":"offline ocr","language":"Python","topic":"ocr","minStars":800}')
  check(
    '正常 JSON 解析成功',
    ok !== null && ok.keywords === 'offline ocr' && ok.language === 'Python' && ok.minStars === 800,
    JSON.stringify(ok)
  )
  check('围栏 JSON 能剥出来', parseSearchPlan('```json\n{"keywords":"a"}\n```')?.keywords === 'a')
  check(
    '前后带解释文字也能兜住',
    parseSearchPlan('好的，这是结果：{"keywords":"a b"} 希望有帮助')?.keywords === 'a b'
  )
  check('缺 keywords 时返回 null', parseSearchPlan('{"language":"Go"}') === null)
  check('keywords 是空白也返回 null', parseSearchPlan('{"keywords":"   "}') === null)
  check('minStars 是字符串时按"没有"处理', parseSearchPlan('{"keywords":"a","minStars":"100"}')?.minStars === null)
  check('minStars 为负/0 时按"没有"处理', parseSearchPlan('{"keywords":"a","minStars":0}')?.minStars === null)
  check('minStars 取整', parseSearchPlan('{"keywords":"a","minStars":12.9}')?.minStars === 12)
  const dirty = parseSearchPlan('{"keywords":"a","language":"","topic":null}')
  check('空字符串语言/ topic 收成 null', dirty?.language === null && dirty?.topic === null)
  check('非对象的 JSON（数组）返回 null', parseSearchPlan('[1,2,3]') === null)
  check('纯垃圾返回 null', parseSearchPlan('这不是 JSON') === null)
  check('空输入返回 null', parseSearchPlan('') === null && parseSearchPlan(null) === null)

  // ---------- 3) searchPlanPrompt ----------
  console.log('\n=== 3) searchPlanPrompt 纯函数 ===')
  const p1 = searchPlanPrompt('能离线跑的中文 OCR 库')
  check('prompt 带上用户原句', p1.includes('能离线跑的中文 OCR 库'))
  check('prompt 要求只输出 JSON', p1.includes('JSON'))
  check('同输入同输出（纯函数）', p1 === searchPlanPrompt('能离线跑的中文 OCR 库'))

  // ---------- 以下都是 Mock 模式的端到端，全程不应有网络请求 ----------
  let fetchCalls = 0
  const origFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    fetchCalls++
    throw new Error('本自检不应发起真实请求')
  }) as typeof fetch

  try {
    // ---------- 4) planSearch 未配置 AI 时返回 null ----------
    console.log('\n=== 4) planSearch：Mock/未配置时返回 null 而不是抛错 ===')
    const planned = await ai.planSearch('随便一句话')
    check('planSearch 返回 null', planned === null, JSON.stringify(planned))
    check('空查询也返回 null', (await ai.planSearch('   ')) === null)

    // ---------- 5) forQuery / similar ----------
    console.log('\n=== 5) forQuery / similar：Mock 端到端 ===')
    check('空查询直接返回空数组', (await recommend.forQuery('   ')).length === 0)

    const first = await recommend.forQuery('react')
    check('能搜到结果', first.length > 0, `${first.length} 条`)

    if (first.length > 0) {
      const hit = first[0] as (typeof first)[number]
      check('结果的 starred_at 不撒谎为 Star 时间', typeof hit.starred_at === 'string')

      // 把第一条"Star"掉，再搜一次：它必须从结果里消失（已经 Star 过的不再推荐）
      await store.saveRepos([hit])
      const second = await recommend.forQuery('react')
      check(
        '已经 Star 过的仓库不再出现在推荐里',
        second.every((r) => r.full_name !== hit.full_name),
        hit.full_name
      )

      // similar：以它为种子，结果里不能有它自己，也不能有语料里已有的
      const sim = await recommend.similar(hit.full_name)
      const known = new Set((await store.getRepos()).map((r) => r.full_name))
      check('similar 不返回种子仓库自己', sim.every((r) => r.full_name !== hit.full_name))
      check('similar 不返回已 Star 过的仓库', sim.every((r) => !known.has(r.full_name)))

      // ---------- 6) github.star 的 Mock 分支 ----------
      console.log('\n=== 6) github.star：Mock 分支幂等 ===')
      const starred = await github.star('new-owner/new-repo')
      check('返回带 full_name 的记录', starred.full_name === 'new-owner/new-repo', starred.full_name)
      const again = await github.star('new-owner/new-repo')
      check('重复 Star 幂等（同一条记录）', again.full_name === starred.full_name)
    }

    const searchEmpty = await github.searchRepos('   ')
    check('空查询不搜（返回空数组）', searchEmpty.length === 0)

    // ---------- 7) forYou：整份收藏的画像与查询 ----------
    console.log('\n=== 7) buildProfile：画像的排序、截断与星数地板 ===')
    {
      const p = recommend.buildProfile([
        mkRepo({ language: 'TypeScript', topics: ['react'], ai_category: '前端', stargazers_count: 1000 }),
        mkRepo({ language: 'TypeScript', topics: ['react'], ai_category: '前端', stargazers_count: 2000 }),
        mkRepo({ language: 'TypeScript', topics: ['cli'], ai_category: '后端', stargazers_count: 3000 }),
        mkRepo({ language: 'TypeScript', topics: ['vue'], stargazers_count: 3000 }),
        mkRepo({ language: 'Go', topics: ['server'], stargazers_count: 3000 }),
        mkRepo({ language: 'Go', topics: ['k8s'], stargazers_count: 3000 }),
        mkRepo({ language: 'Python', topics: ['ml'], stargazers_count: 4000 }),
        mkRepo({ language: 'Rust', topics: ['wgpu'], stargazers_count: 5000 })
      ])
      check('total = 语料条数', p.total === 8, String(p.total))
      check(
        '语言按次数降序，同数打平按字典序，且只留 3 个',
        p.languages.join(',') === 'TypeScript,Go,Python',
        p.languages.join(',')
      )
      check('主题按次数降序（react 出现 2 次排第一）', p.topics[0] === 'react', p.topics.join(','))
      check('主题最多 5 个', p.topics.length === 5, String(p.topics.length))
      check('分类取出现最多的那个', p.category === '前端', String(p.category))
      // 星数中位数 3000（升序后下标 4），3000 * 0.2 = 600
      check('星数地板 = 中位数的 20%', p.starFloor === 600, String(p.starFloor))
    }

    {
      const tiny = recommend.buildProfile([
        mkRepo({ stargazers_count: 10 }),
        mkRepo({ stargazers_count: 20 })
      ])
      check('小项目的收藏有 50 星下限（不设下限会搜出一堆空仓库）', tiny.starFloor === 50, String(tiny.starFloor))

      const huge = recommend.buildProfile([
        mkRepo({ stargazers_count: 100_000 }),
        mkRepo({ stargazers_count: 200_000 }),
        mkRepo({ stargazers_count: 300_000 })
      ])
      check('大项目的收藏有 5000 星上限（不封顶会把结果全滤空）', huge.starFloor === 5000, String(huge.starFloor))

      const empty = recommend.buildProfile([])
      check(
        '空语料：画像全空、分类为 null、地板仍取下限',
        empty.total === 0 &&
          empty.languages.length === 0 &&
          empty.topics.length === 0 &&
          empty.category === null &&
          empty.starFloor === 50,
        JSON.stringify(empty)
      )
      check('一条都没分类时 category 为 null', recommend.buildProfile([mkRepo()]).category === null)
    }

    console.log('\n=== 7) buildForYouQueries：三条查询的分工与兜底 ===')
    {
      const profile = recommend.buildProfile([
        mkRepo({ language: 'TypeScript', topics: ['react'], ai_category: '前端', stargazers_count: 1000 }),
        mkRepo({ language: 'TypeScript', topics: ['react'], ai_category: '前端', stargazers_count: 1000 }),
        // 语言数刻意压成 TS 3 : Go 2，避免同数打平时按字典序把 Go 排在前面——
        // 那条打平规则本身在上面 buildProfile 那节单独断言过了
        mkRepo({ language: 'TypeScript', topics: ['vue'], ai_category: '前端', stargazers_count: 1000 }),
        mkRepo({ language: 'Go', topics: ['cli'], ai_category: '后端', stargazers_count: 1000 }),
        mkRepo({ language: 'Go', topics: ['k8s'], stargazers_count: 1000 })
      ])
      const qs = recommend.buildForYouQueries(profile)
      check('最多 3 条查询', qs.length === 3, `${qs.length} 条：${qs.join(' | ')}`)
      check('第 1 条 = 最强主题 + 主力语言 + 地板', qs[0] === 'topic:react language:TypeScript stars:>=200', qs[0])
      check('第 2 条刻意不限语言（收藏常跨语言）', qs[1] === 'topic:cli stars:>=200', qs[1])
      check('第 3 条 = 第三主题 + 次语言', qs[2] === 'topic:k8s language:Go stars:>=200', qs[2])
      check('每条都带星数地板', qs.every((q) => q.includes('stars:>=')), qs.join(' | '))
      check('同输入同输出（纯函数）', recommend.buildForYouQueries(profile).join('|') === qs.join('|'))
    }

    {
      // 一条 topic 都没有：很多人压根不给仓库打标签，这时不能拼出「只有星数地板」的查询，
      // 那等于搜「全站最热」，是噪音不是推荐
      const noTopics = recommend.buildProfile([
        mkRepo({ language: 'Go', stargazers_count: 1000 }),
        mkRepo({ language: 'Go', stargazers_count: 1000 })
      ])
      const qs = recommend.buildForYouQueries(noTopics)
      check('没有 topic 时退到纯语言查询', qs.length > 0 && qs.every((q) => q.includes('language:Go')), qs.join(' | '))
      check(
        '任何一条都不会只剩星数地板',
        qs.every((q) => q.replace(/stars:>=\d+/g, '').trim() !== ''),
        qs.join(' | ')
      )

      const nothing = recommend.buildProfile([mkRepo({ language: null, topics: [] })])
      check('什么信号都没有时返回空查询（不会发空搜索）', recommend.buildForYouQueries(nothing).length === 0)
    }

    {
      // offset 是「换一批」的位移：必须真的换到画像里排后面的主题
      const profile = recommend.buildProfile([
        mkRepo({ topics: ['a'], language: 'Go', stargazers_count: 100 }),
        mkRepo({ topics: ['b'], language: 'Rust', stargazers_count: 100 }),
        mkRepo({ topics: ['c'], language: 'Zig', stargazers_count: 100 })
      ])
      const first = recommend.buildForYouQueries(profile, 0)
      const second = recommend.buildForYouQueries(profile, 1)
      check('换一批会给出不一样的查询', first.join('|') !== second.join('|'), `${first[0]} → ${second[0]}`)
      check('第 1 条换成了第二位主题', second[0].includes('topic:b'), second[0])
      check(
        '位移绕回后与 offset=0 一致（循环位移，不是越界）',
        recommend.buildForYouQueries(profile, 3).join('|') === first.join('|')
      )
      check('负位移不炸', recommend.buildForYouQueries(profile, -1).length > 0)
    }

    console.log('\n=== 7) forYou：Mock 端到端（用一份受控语料）===')
    {
      const corpus: Repo[] = [
        mkRepo({ full_name: 'me/one', language: 'TypeScript', topics: ['react'], ai_category: '前端' }),
        mkRepo({ full_name: 'me/two', language: 'TypeScript', topics: ['react'], ai_category: '前端' }),
        mkRepo({ full_name: 'me/three', language: 'Go', topics: ['cli'], ai_category: '后端' })
      ]
      await store.saveRepos(corpus)

      const { items, profile } = await recommend.forYou(0)
      check('返回画像，且 total 与语料一致', profile.total === 3, String(profile.total))
      check('画像带上了主力语言', profile.languages[0] === 'TypeScript', profile.languages.join(','))
      check('推荐结果条数不超过上限', items.length <= 12, `${items.length} 条`)
      check('返回的是数组', Array.isArray(items))
      const known = new Set(corpus.map((r) => r.full_name))
      check('不会推荐已经 Star 过的仓库', items.every((r) => !known.has(r.full_name)), items.map((r) => r.full_name).join(','))
      check(
        '换一批（offset=1）同样不返回已 Star 的',
        (await recommend.forYou(1)).items.every((r) => !known.has(r.full_name))
      )
    }

    check('全程没有发起任何真实网络请求', fetchCalls === 0, `fetch 调用 ${fetchCalls} 次`)
  } finally {
    globalThis.fetch = origFetch
  }

  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
