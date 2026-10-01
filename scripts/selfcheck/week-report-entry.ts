// 周报派生数据的自检：纯函数，不需要 Electron、不发网络请求。
//
// 跑法：node scripts/selfcheck/week-report.mjs
//
// 为什么值得单独测：周报页上「本周项目动态」「本周新增分类」这两块全靠
// weekActivity.ts 里的纯函数算。它们都建立在**时间窗口**上——Release 恰好卡在
// 周一零点或周日最后一毫秒的那一条，界面上完全看不出错，只是悄悄多一条或少一条。
// 另外 reportPrompt 有个容易写错的地方：没有新版本时**不能**在提示词里提"新版本"
// 这回事，否则模型会顺着话头编出几个不存在的 Release。这里也一并钉住。
import {
  pickWatchlist,
  pickLatestInWindow,
  weekCategoryStats,
  WATCH_LIMIT
} from '../../src/renderer/src/lib/weekActivity'
import { reportPrompt } from '../../src/main/ai-prompts'
import type { Repo, Release, WeeklyReport } from '@shared/types'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

const DAY = 86_400_000
/** 固定的「本周」：2026-01-12（周一）00:00Z ~ 2026-01-18（周日）23:59:59.999Z */
const WEEK_START = Date.UTC(2026, 0, 12)
const WEEK_END = Date.UTC(2026, 0, 18, 23, 59, 59, 999)

let seq = 0
function repo(over: Partial<Repo> = {}): Repo {
  seq += 1
  return {
    id: seq,
    full_name: `owner/repo-${seq}`,
    description: null,
    language: 'TypeScript',
    stargazers_count: 100,
    html_url: `https://github.com/owner/repo-${seq}`,
    starred_at: new Date(WEEK_START).toISOString(),
    topics: [],
    pushed_at: null,
    latest_release: null,
    ...over
  }
}

function rel(tag: string, at: number | null, name: string | null = null): Release {
  return {
    tag_name: tag,
    name,
    published_at: at === null ? '' : new Date(at).toISOString(),
    html_url: `https://github.com/owner/repo/releases/tag/${tag}`
  }
}

function report(over: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    weekStart: new Date(WEEK_START).toISOString(),
    weekEnd: new Date(WEEK_END).toISOString(),
    newStars: [],
    languageStats: {},
    dailyStarCount: {},
    topRepos: [],
    aiSummary: '',
    ...over
  }
}

/* ------------------------------------------------------------------ */
/* 1) pickWatchlist：本周新增优先，去重，截断                            */
/* ------------------------------------------------------------------ */

console.log('\n=== 1) pickWatchlist ===')
{
  const a = repo({ full_name: 'o/week-new' })
  const b = repo({ full_name: 'o/top-1' })
  const c = repo({ full_name: 'o/top-2' })
  // top-1 同时也在本周新增里：只能出现一次
  const w = pickWatchlist(report({ newStars: [a, b], topRepos: [b, c] }), 10)
  check('去重后 3 条', w.length === 3, w.map((r) => r.full_name).join(','))
  check('本周新增排在星标榜前面', w[0].full_name === 'o/week-new', w.map((r) => r.full_name).join(','))
}

{
  const many = Array.from({ length: 20 }, (_, i) => repo({ full_name: `o/n-${i}` }))
  const w = pickWatchlist(report({ newStars: many }), 4)
  check('超出上限时截断到 limit', w.length === 4, String(w.length))
  check('截断时保留的是靠前的那些', w[3].full_name === 'o/n-3', w[3].full_name)
  check('默认上限是 10', pickWatchlist(report({ newStars: many })).length === WATCH_LIMIT)
}

{
  check('空周报返回空数组', pickWatchlist(report()).length === 0)
  const only = repo({ full_name: 'o/only' })
  check('只有星标榜时也能取到', pickWatchlist(report({ topRepos: [only] })).length === 1)
}

/* ------------------------------------------------------------------ */
/* 2) pickLatestInWindow：窗口边界与「只取最新」                         */
/* ------------------------------------------------------------------ */

console.log('\n=== 2) pickLatestInWindow ===')
{
  const hits = pickLatestInWindow(
    [
      // 窗口内两个版本：取新的那个
      { fullName: 'o/multi', releases: [rel('v1.0', WEEK_START + DAY), rel('v2.0', WEEK_START + 3 * DAY)] },
      // 恰好卡在周一零点和周日最后一毫秒：都算本周（闭区间）
      { fullName: 'o/onstart', releases: [rel('v1.0', WEEK_START)] },
      { fullName: 'o/onend', releases: [rel('v1.0', WEEK_END)] },
      // 差一毫秒出界
      { fullName: 'o/before', releases: [rel('v1.0', WEEK_START - 1)] },
      { fullName: 'o/after', releases: [rel('v1.0', WEEK_END + 1)] },
      // 草稿 Release：published_at 是空串，没有时间就判断不了
      { fullName: 'o/draft', releases: [rel('v1.0', null)] },
      // 一条 Release 都没有
      { fullName: 'o/none', releases: [] }
    ],
    WEEK_START,
    WEEK_END
  )

  check('只留下本周发过版本的 3 个仓库', hits.length === 3, hits.map((h) => h.fullName).join(','))
  check('同一个仓库只出一条（取最新）', hits.find((h) => h.fullName === 'o/multi')?.tag === 'v2.0')
  check('周一零点那一毫秒算本周', hits.some((h) => h.fullName === 'o/onstart'))
  check('周日最后一毫秒算本周', hits.some((h) => h.fullName === 'o/onend'))
  check('早一毫秒的不算', !hits.some((h) => h.fullName === 'o/before'))
  check('晚一毫秒的不算', !hits.some((h) => h.fullName === 'o/after'))
  check('published_at 为空的草稿不算', !hits.some((h) => h.fullName === 'o/draft'))
  check(
    '按发布时间倒序（新的在前）',
    hits.map((h) => h.fullName).join(',') === 'o/onend,o/multi,o/onstart',
    hits.map((h) => h.fullName).join(',')
  )
  check('带上了 tag 与链接', hits[0].tag === 'v1.0' && hits[0].htmlUrl.includes('/releases/tag/'))
}

{
  // 时间戳解析不出来时不能算进本周（否则页面上会多一条查不到日期的动态）
  const hits = pickLatestInWindow(
    [{ fullName: 'o/dirty', releases: [{ ...rel('v1.0', WEEK_START), published_at: '不是时间' }] }],
    WEEK_START,
    WEEK_END
  )
  check('解析不出的 published_at 被跳过', hits.length === 0)
  check('空输入返回空数组', pickLatestInWindow([], WEEK_START, WEEK_END).length === 0)
}

/* ------------------------------------------------------------------ */
/* 3) weekCategoryStats                                                 */
/* ------------------------------------------------------------------ */

console.log('\n=== 3) weekCategoryStats ===')
{
  const stats = weekCategoryStats([
    repo({ ai_category: '前端' }),
    repo({ ai_category: '前端' }),
    repo({ ai_category: '后端' }),
    repo({ ai_category: null }),
    repo({ ai_category: '工具' })
  ])
  // ⚠️ 只断言「谁最多」和「其余各 1 条」，**不断言中文名的先后**：
  // localeCompare 的中文顺序取决于运行环境的默认 locale（拼音还是码位），
  // 钉死它会让这条断言换一台机器就飘。
  check(
    '计数最高的排最前',
    stats[0].name === '前端' && stats[0].count === 2,
    stats.map((s) => `${s.name}:${s.count}`).join(',')
  )
  check(
    '其余各 1 条，且未分类单独成桶',
    stats.length === 4 &&
      stats.slice(1).every((s) => s.count === 1) &&
      ['后端', '工具', '未分类'].every((n) => stats.some((s) => s.name === n)),
    stats.map((s) => `${s.name}:${s.count}`).join(',')
  )
  check('空输入返回空数组', weekCategoryStats([]).length === 0)
}

/* ------------------------------------------------------------------ */
/* 4) reportPrompt：没有新版本时绝不能提「新版本」                        */
/* ------------------------------------------------------------------ */

console.log('\n=== 4) reportPrompt ===')
{
  const repos = [repo({ full_name: 'o/one' })]
  const plain = reportPrompt(repos)
  check('带上了仓库全名', plain.includes('o/one'))
  check(
    '没有新版本时提示词里不出现「新版本」（否则模型会顺着编）',
    !plain.includes('新版本') && !plain.includes('Release'),
    plain.slice(-80)
  )
  check('同输入同输出（纯函数）', plain === reportPrompt(repos))

  const withRel = reportPrompt(repos, [
    {
      fullName: 'o/one',
      tag: 'v2.0',
      name: 'Big Release',
      publishedAt: new Date(WEEK_START + DAY).toISOString(),
      htmlUrl: 'https://github.com/o/one/releases/tag/v2.0'
    }
  ])
  check('有新版本时把仓库名与 tag 写进提示词', withRel.includes('o/one') && withRel.includes('v2.0'))
  check('有新版本时多出一条要求（必须提一句）', withRel.includes('7)'))
  check('没有新版本时不加那条要求', !plain.includes('7)'))
  check(
    'Release 名称不写进提示词（避免模型复述甚至编造说明文字）',
    !withRel.includes('Big Release')
  )
}

console.log(`\n${failures === 0 ? '== 全部通过 ==' : `== 有 ${failures} 条失败 ==`}`)
process.exit(failures === 0 ? 0 : 1)
