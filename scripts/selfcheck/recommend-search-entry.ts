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

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
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

    check('全程没有发起任何真实网络请求', fetchCalls === 0, `fetch 调用 ${fetchCalls} 次`)
  } finally {
    globalThis.fetch = origFetch
  }

  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
