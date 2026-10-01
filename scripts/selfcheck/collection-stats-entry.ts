// 收藏总览统计的自检：纯函数，不需要 Electron、不发网络请求。
//
// 跑法：node scripts/selfcheck/collection-stats.mjs
//
// 为什么值得单独测：Overview 页上「近 7 天新增 / 近期活跃 / 可能已停更」这些数字
// 全部由它算出来，而它们都建立在**时间窗口**上——差一天的边界错误在界面上
// 完全看不出来（数字还是有，只是悄悄错了一个）。这里把 now 固定住逐条卡边界。
//
// ⚠️ 时间口径必须是 UTC 日历天，与 Repo.starred_at / report.ts 一致。
//    用本地时间算的话东八区深夜的记录会前后差一天，这个自检就会开始飘。
import {
  ACTIVE_WINDOW_DAYS,
  STALE_WINDOW_DAYS,
  RECENT_WINDOW_DAYS,
  computeCollectionStats,
  starTrendBuckets,
  starredBucket,
  utcDayStart,
  utcDayKey,
  isRealCategory,
  buildAiDigest
} from '../../src/renderer/src/lib/collectionStats'
import type { Repo } from '@shared/types'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

const DAY = 86_400_000
/** 固定的「现在」：2026-01-15 12:00 UTC。所有窗口边界都相对它手算。 */
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0)
const TODAY_START = Date.UTC(2026, 0, 15)
const RECENT_START = TODAY_START - 6 * DAY // 2026-01-09 00:00Z
const PREV_START = TODAY_START - 13 * DAY // 2026-01-02 00:00Z

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

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
    starred_at: iso(NOW),
    topics: [],
    pushed_at: iso(NOW),
    latest_release: null,
    ...over
  }
}

/* ------------------------------------------------------------------ */
/* 1) 空输入                                                            */
/* ------------------------------------------------------------------ */

console.log('\n=== 1) 空输入 ===')
{
  const s = computeCollectionStats([], NOW)
  check('全部计数为 0', s.total === 0 && s.totalStars === 0 && s.recent7 === 0)
  check('topRepo 为 null', s.topRepo === null)
  check('平均星标 0（不是 NaN）', s.avgStars === 0, String(s.avgStars))
  check('分类桶仍有 8 项（7 枚举 + 未分类）', s.categories.length === 8, String(s.categories.length))
  check(
    '分类桶全部为 0 且 ratio 不是 NaN',
    s.categories.every((b) => b.count === 0 && b.ratio === 0)
  )
  check('语言/主题列表为空', s.topLanguages.length === 0 && s.topTopics.length === 0)
}

/* ------------------------------------------------------------------ */
/* 2) 时间窗口边界                                                      */
/* ------------------------------------------------------------------ */

console.log('\n=== 2) 近 N 天 / 前 N 天的 UTC 日历天边界 ===')
{
  const s = computeCollectionStats(
    [
      repo({ starred_at: iso(NOW) }), // 今天
      repo({ starred_at: iso(RECENT_START) }), // 最近窗口的第一毫秒
      repo({ starred_at: iso(RECENT_START - 1) }), // 差 1ms，落到前一扇窗
      repo({ starred_at: iso(PREV_START) }), // 前一扇窗的第一毫秒
      repo({ starred_at: iso(PREV_START - 1) }), // 再早 1ms，两个窗口都不算
      repo({ starred_at: '不是时间' }) // 脏数据，忽略
    ],
    NOW
  )
  check('近 7 天新增 = 2（含边界那一毫秒）', s.recent7 === 2, String(s.recent7))
  check('前 7 天新增 = 2', s.prev7 === 2, String(s.prev7))
  check('解析不出来的 starred_at 不计数', s.total === 6, `total=${s.total}`)
}

console.log('\n=== 2) utcDayStart 按 UTC 切天，不看本地时区 ===')
{
  // 东八区 2026-01-16 07:00 = UTC 2026-01-15 23:00，应当归到 15 号
  const t = Date.UTC(2026, 0, 15, 23, 0, 0)
  check('UTC 23:00 仍属于当天', utcDayStart(t) === TODAY_START, iso(utcDayStart(t)))
}

/* ------------------------------------------------------------------ */
/* 3) 活跃度：null 与「停更」必须分开                                    */
/* ------------------------------------------------------------------ */

console.log('\n=== 3) 活跃度分桶 ===')
{
  const s = computeCollectionStats(
    [
      repo({ pushed_at: iso(NOW - 10 * DAY) }), // 活跃
      repo({ pushed_at: iso(NOW - 90 * DAY + 1) }), // 刚好在 90 天内
      repo({ pushed_at: iso(NOW - 90 * DAY) }), // 恰好 90 天：不算活跃
      repo({ pushed_at: iso(NOW - 200 * DAY) }), // 既不活跃也不停更
      repo({ pushed_at: iso(NOW - 365 * DAY) }), // 恰好一年：算停更
      repo({ pushed_at: iso(NOW - 400 * DAY) }), // 远超过一年：也算停更
      repo({ pushed_at: null }) // 拿不到
    ],
    NOW
  )
  check('近期活跃 = 2', s.activeRecently === 2, String(s.activeRecently))
  check('可能已停更 = 2（365 天边界与远超各一）', s.stale === 2, `stale=${s.stale}`)
  check('拿不到提交时间的单独计数 = 1', s.unknownPush === 1, String(s.unknownPush))
  check('三者互不重叠：2 活跃 + 2 停更 + 1 未知 = 5（剩下 2 个两不沾）', s.activeRecently + s.stale + s.unknownPush === 5)
  check(
    'null 不会被算进「已停更」（否则页面上的数字在撒谎）',
    s.stale === 2 && s.unknownPush === 1
  )
}

/* ------------------------------------------------------------------ */
/* 4) 本地标记与分类                                                    */
/* ------------------------------------------------------------------ */

console.log('\n=== 4) clone / fork / 分类 计数 ===')
{
  const s = computeCollectionStats(
    [
      repo({ local: { cloned_path: '/tmp/a' } }),
      repo({ local: { forked_full_name: 'me/a' } }),
      repo({ local: { cloned_path: '/tmp/b', forked_full_name: 'me/b' } }),
      repo({ ai_category: '前端' }),
      repo({ ai_category: '前端' }),
      repo({ ai_category: '工具' })
    ],
    NOW
  )
  check('已 Clone = 2', s.cloned === 2, String(s.cloned))
  check('已 Fork = 2', s.forked === 2, String(s.forked))
  check('已分类 = 3', s.categorized === 3, String(s.categorized))
  check('未分类 = 3', s.uncategorized === 3, String(s.uncategorized))

  const front = s.categories.find((b) => b.name === '前端')
  check('「前端」桶计数 = 2', front?.count === 2, String(front?.count))
  check('分类桶保持固定顺序（第 0 个是 AI/ML）', s.categories[0]?.name === 'AI/ML', s.categories[0]?.name)
  check('最后一个桶是「未分类」', s.categories[7]?.name === '未分类', s.categories[7]?.name)
  check('未分类桶不是真枚举', !isRealCategory('未分类'))
  check('「前端」是真枚举', isRealCategory('前端'))
}

/* ------------------------------------------------------------------ */
/* 5) 排行榜：排序稳定性与上限                                           */
/* ------------------------------------------------------------------ */

console.log('\n=== 5) 语言 / 主题排名 ===')
{
  const repos: Repo[] = []
  // 8 种语言，各出现 1 次：用来验「同数打平按字典序」和「只取前 6」
  for (const lang of ['Zig', 'Rust', 'Go', 'Java', 'Ruby', 'PHP', 'Lua', 'C']) {
    repos.push(repo({ language: lang }))
  }
  repos.push(repo({ language: null })) // 无语言：不进语言分布
  const s = computeCollectionStats(repos, NOW)

  check('语言数 = 8', s.languageCount === 8, String(s.languageCount))
  check('语言榜最多 6 条', s.topLanguages.length === 6, String(s.topLanguages.length))
  check(
    '打平时按字典序（C / Go / Java / Lua / PHP / Ruby）',
    s.topLanguages.map((b) => b.name).join(',') === 'C,Go,Java,Lua,PHP,Ruby',
    s.topLanguages.map((b) => b.name).join(',')
  )
  check(
    'ratio 以仓库总数为分母（1/9）',
    Math.abs((s.topLanguages[0]?.ratio ?? 0) - 1 / 9) < 1e-9,
    String(s.topLanguages[0]?.ratio)
  )
}

{
  const s = computeCollectionStats(
    [
      repo({ topics: ['react', 'cli'] }),
      repo({ topics: ['react', 'cli'] }),
      repo({ topics: ['react'] })
    ],
    NOW
  )
  check('主题去重计数 = 2', s.topicCount === 2, String(s.topicCount))
  check(
    '主题按出现次数降序（react 3 / cli 2）',
    s.topTopics.map((t) => `${t.name}:${t.count}`).join(',') === 'react:3,cli:2',
    s.topTopics.map((t) => `${t.name}:${t.count}`).join(',')
  )
  check('主题桶不带 ratio 字段（它按仓库数算分母是错的）', !('ratio' in (s.topTopics[0] ?? {})))
}

/* ------------------------------------------------------------------ */
/* 6) 汇总数字与确定性                                                  */
/* ------------------------------------------------------------------ */

console.log('\n=== 6) 汇总与确定性 ===')
{
  const repos = [
    repo({ stargazers_count: 100 }),
    repo({ stargazers_count: 300 }),
    repo({ stargazers_count: 50 })
  ]
  const s = computeCollectionStats(repos, NOW)
  check('总星标 = 450', s.totalStars === 450, String(s.totalStars))
  check('平均星标 = 150', s.avgStars === 150, String(s.avgStars))
  check('最热仓库是 300 星那个', s.topRepo?.stargazers_count === 300, String(s.topRepo?.stargazers_count))
  check('最热仓库是原对象引用（不是拷贝）', s.topRepo === repos[1])
}

{
  const repos = [repo({ language: 'Go' }), repo({ language: 'Rust', ai_category: '后端' })]
  const a = computeCollectionStats(repos, NOW)
  const b = computeCollectionStats(repos, NOW)
  check('同输入同输出（纯函数）', JSON.stringify(a) === JSON.stringify(b))
  check('换一个 now，窗口外的数据会变', computeCollectionStats(repos, NOW + 30 * DAY).recent7 === 0)
}

console.log('\n=== 7) buildAiDigest：喂给模型的摘要 ===')
{
  const repos = [
    repo({ language: 'TypeScript', ai_category: '前端', topics: ['react'], stargazers_count: 1000 }),
    repo({ language: 'TypeScript', ai_category: '前端', topics: ['react'], stargazers_count: 500 }),
    repo({ language: 'Go', ai_category: '后端', topics: ['cli'], stargazers_count: 200 }),
    repo({ language: null })
  ]
  const stats = computeCollectionStats(repos, NOW)
  const digest = buildAiDigest(stats, NOW)

  check('带上统计日期', digest.includes('2026-01-15'), digest.split('\n')[1])
  check('仓库总数写进去了', digest.includes('仓库总数：4'))
  check('语言分布写进去了', digest.includes('TypeScript 2'))
  check('分类分布只列非空桶', digest.includes('前端 2') && digest.includes('后端 1'))
  check('空桶不进摘要（否则模型会对着 0 说事）', !digest.includes('DevOps'))
  // ⚠️ 这条断言同时钉住**措辞**：必须说「最近 N 天」而不是「本周」。
  // 这扇窗是含今天在内的滚动 N 天，周报页另有一张真按日历周算的「本周新增 Star」，
  // 模型拿到「本周」会按日历周解读，而这扇窗在周三已经跨到上周去了。
  // 天数从常量拼（与卡片、筛选下拉同源），所以不写死 7。
  check(
    '近 N 天与前 N 天一起给（且不许写成「本周」）',
    new RegExp(`最近 ${RECENT_WINDOW_DAYS} 天新增 \\d+ 个，前 ${RECENT_WINDOW_DAYS} 天 \\d+ 个`).test(digest) &&
      !digest.includes('本周'),
    digest.split('\n').find((l) => l.includes('新增'))
  )
  // 这条原来钉的是旧措辞「90 天内有过提交 / 超过一年没提交」。措辞这次是有意改的
  // （天数要跟常量走，且「一年」和 365 天到底等不等得让读的人自己换算），
  // 所以断言跟着改写——但**不是放松**：天数改成引用常量，摘要里再写死一个 90
  // 就会被逮住；而"拿不到时间的要单独说一句"挪到下面那个专门的数据集上钉。
  check(
    '活跃度的两个天数来自常量（改常量摘要就该跟着改）',
    digest.includes(`${ACTIVE_WINDOW_DAYS} 天内有过提交的`) &&
      digest.includes(`${STALE_WINDOW_DAYS} 天以上没提交的`)
  )
  check('最热仓库作为锚点出现', digest.includes('星标最多的一个'))
  check(
    '只给出一个仓库全名，不把列表倒给模型',
    digest.split('\n').filter((l) => l.includes('owner/repo-')).length === 1
  )
  check('摘要不含未分类的误导性措辞', !digest.includes('undefined') && !digest.includes('NaN'))
}

{
  // 「拿不到提交时间」必须与「已停更」分开说。上面那个数据集全是有效的 pushed_at，
  // 走不到这一句，所以单独给一个能触发的数据集——把"不知道"混进"死了"，
  // 模型会把它当成一个事实复述出来。
  const stats = computeCollectionStats(
    [repo({ pushed_at: null }), repo({ pushed_at: iso(NOW - (STALE_WINDOW_DAYS + 1) * DAY) })],
    NOW
  )
  const digest = buildAiDigest(stats, NOW)
  const line = digest.split('\n').find((l) => l.startsWith('活跃度')) ?? ''
  check(
    '拿不到提交时间的仓库在摘要里单独一句',
    stats.unknownPush === 1 && digest.includes('另有 1 个拿不到提交时间'),
    line
  )
  check(
    '摘要里的三个数字就是统计出来的三个数字',
    stats.activeRecently === 0 && stats.stale === 1 && line.includes('有过提交的 0 个') && line.includes('没提交的 1 个'),
    line
  )
}

{
  // 一条都没分类时不能出现空字符串拼接出来的「AI 分类分布：」
  const stats = computeCollectionStats([repo()], NOW)
  const digest = buildAiDigest(stats, NOW)
  check('全未分类时给出可读提示', digest.includes('都还没分类'), digest.split('\n').find((l) => l.startsWith('AI 分类分布')))
}

{
  // 有真分类、也有没跑的：两边都要说，模型才知道还有补全的余地。
  // 这条是上面那个 bug 的另一半——「未分类」必须跟真分类分开措辞，不能并排当成一个分类。
  const stats = computeCollectionStats(
    [repo({ ai_category: '前端' }), repo({ ai_category: '前端' }), repo(), repo()],
    NOW
  )
  const line = buildAiDigest(stats, NOW)
    .split('\n')
    .find((l) => l.startsWith('AI 分类分布'))
  check('真分类与未分类分开表述', line === 'AI 分类分布：前端 2；另有 2 个未分类', line)
}

/* ------------------------------------------------------------------ */
/* 8) starTrendBuckets：趋势图的分桶                                    */
/* ------------------------------------------------------------------ */

console.log('\n=== 8) 趋势图分桶 ===')
{
  // 趋势图原来在组件的 useMemo 里现算，渲染进程没有 DOM 测试环境，写错了没人看得见。
  // 抽成纯函数之后，这里可以把「图上加起来 = 卡片上的数」这条关系直接钉住。
  const pts = starTrendBuckets(
    [
      repo({ starred_at: iso(NOW) }), // 今天
      repo({ starred_at: iso(NOW) }), // 今天
      repo({ starred_at: iso(NOW - 3 * DAY) }),
      repo({ starred_at: iso(NOW - 6 * DAY) }), // 窗口最早的一天
      repo({ starred_at: iso(NOW - 7 * DAY) }), // 刚好出窗
      repo({ starred_at: '不是日期' })
    ],
    NOW
  )

  check('桶数 = RECENT_WINDOW_DAYS', pts.length === RECENT_WINDOW_DAYS, String(pts.length))
  check('最后一个桶是今天（UTC）', pts[pts.length - 1]!.key === '2026-01-15', pts[pts.length - 1]!.key)
  check(
    '第一个桶比今天早 RECENT_WINDOW_DAYS-1 天',
    pts[0]!.key === utcDayKey(TODAY_START - (RECENT_WINDOW_DAYS - 1) * DAY),
    pts[0]!.key
  )
  check(
    '日期键连续无断点（折线才不会断）',
    pts.every((p, i) => i === 0 || Date.parse(p.key) - Date.parse(pts[i - 1]!.key) === DAY),
    pts.map((p) => p.key).join(',')
  )
  check(
    '计数按 UTC 日历天分桶',
    pts.map((p) => p.count).join(',') === '1,0,0,1,0,0,2',
    pts.map((p) => p.count).join(',')
  )
  check(
    "label 是 'MM-DD' 形状（坐标轴要用）",
    pts.every((p) => p.label.length === 5 && p.label === p.key.slice(5)),
    pts[0]!.label
  )
  check('解析不出的 starred_at 不计入任何桶', pts.reduce((n, p) => n + p.count, 0) === 4)

  // 空输入也必须给齐 RECENT_WINDOW_DAYS 个 0：返回空数组的话折线直接没了，
  // 而页面上看起来"图还在，只是没数据"——这正是本项目最忌讳的那种安静的错误。
  const empty = starTrendBuckets([], NOW)
  check(
    '空输入返回齐整的一排 0（不是空数组）',
    empty.length === RECENT_WINDOW_DAYS && empty.every((p) => p.count === 0)
  )

  // ⚠️ 与「近 N 天新增」卡片的关系：两条路径共用同一扇窗，所以必须相等。
  // 除了一种情况——见下一条。
  const windowRepos = [
    repo({ starred_at: iso(NOW) }),
    repo({ starred_at: iso(NOW - 2 * DAY) }),
    repo({ starred_at: iso(NOW - 6 * DAY) }),
    repo({ starred_at: iso(NOW - 7 * DAY) }),
    repo({ starred_at: iso(NOW - 30 * DAY) })
  ]
  const chartSum = starTrendBuckets(windowRepos, NOW).reduce((n, p) => n + p.count, 0)
  check(
    '图上加起来 == 「近 N 天新增」卡片上的数',
    chartSum === computeCollectionStats(windowRepos, NOW).recent7 && chartSum === 3,
    `${chartSum} vs ${computeCollectionStats(windowRepos, NOW).recent7}`
  )
  check(
    '出窗的数据一个都不进图',
    starTrendBuckets(windowRepos, NOW).reduce((n, p) => n + p.count, 0) ===
      windowRepos.filter((r) => starredBucket(r, NOW) === 'week').length
  )

  // 时钟偏差：未来时间戳会被「近 N 天新增」数进去，却落不进任何一个桶（最后一个桶是"今天"）。
  // 这条差异是**刻意保留**的（不为一条异常数据把坐标轴画到明天），钉住免得被"顺手修掉"。
  const future = [repo({ starred_at: iso(NOW + 3 * DAY) })]
  check(
    '未来时间戳：卡片算它、图里没有它（刻意保留的差异）',
    computeCollectionStats(future, NOW).recent7 === 1 && starTrendBuckets(future, NOW).every((p) => p.count === 0)
  )
}

console.log(`\n${failures === 0 ? '== 全部通过 ==' : `== 有 ${failures} 条失败 ==`}`)
process.exit(failures === 0 ? 0 : 1)
