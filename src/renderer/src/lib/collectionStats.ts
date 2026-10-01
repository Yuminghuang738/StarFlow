/**
 * 收藏库的统计计算（纯函数）。
 *
 * 单独成模块而不是写在 Overview.tsx 里：这里是**全部派生数据**的来源，
 * 塞进组件会让页面变成一大坨 useMemo，也没法脱离 React 断言。
 * 纯函数 + 显式传入 `now`，保证「同输入同输出」，自检里可以直接喂假数据。
 *
 * ⚠️ 时间口径必须与主进程 report.ts、后端 Repo.starred_at（UTC ISO 8601）一致：
 * 「本周」「上周」都按 **UTC 日历天**切，用本地时间会让东八区深夜的记录前后差一天。
 */

import type { Repo, AiCategory } from '@shared/types'
import { AI_CATEGORIES } from '@shared/types'

const DAY = 86_400_000

/**
 * 多久没 push 算「近期活跃」——比 star 时间更能反映项目还活着。
 *
 * 导出（而不是只在本文件里用）是因为**四处的文案都要提到这个天数**：
 * 总览的卡片提示、筛选下拉的选项、给模型的摘要、自检里的边界。
 * 从前它们各自写死「90 天」，常量改成别的值之后，四处文案会一起开始骗人，
 * 而代码本身跑得好好的——与 RECENT_WINDOW_DAYS 是同一条理由。
 *
 * 同理，文案里一律写数字（「90 天」）而不是「三个月」这类说法：
 * 「一年」和 365 天到底等不等，读代码的人得先替我们做一次换算。
 */
export const ACTIVE_WINDOW_DAYS = 90

/** 多久没 push 算「已停更」。同样导出，理由见上。 */
export const STALE_WINDOW_DAYS = 365

/**
 * 一个仓库的活跃度分档。
 *
 * ⚠️ 四档**不是划分**：ACTIVE_WINDOW_DAYS 到 STALE_WINDOW_DAYS 之间没有名字，
 * 会落到 'middle'。
 * 四个名字各自对应总览页上的一个数字（'middle' 不对应任何数字），
 * 所以列表筛选可以直接拿它当条件，筛出来的条数必然与卡片上的数字一致。
 */
export type ActivityBucket = 'active' | 'middle' | 'stale' | 'unknown'

/**
 * 活跃度分档。放在这里而不是让筛选那边自己判定，是为了**只有一处阈值**：
 * 总览卡片上的「近期活跃 40」与筛选出来 40 条必须永远对得上，
 * 两份各自 if 一遍迟早会漂移，而漂移之后页面只是在安静地撒谎。
 */
export function activityBucket(repo: Repo, now: number): ActivityBucket {
  const pushedAt = safeTime(repo.pushed_at)
  // null 是「拿不到」，不是「停更」，两者混在一起会让页面上的数字撒谎
  if (pushedAt === null) return 'unknown'
  const age = now - pushedAt
  if (age >= STALE_WINDOW_DAYS * DAY) return 'stale'
  if (age < ACTIVE_WINDOW_DAYS * DAY) return 'active'
  return 'middle'
}

export interface Bucket {
  name: string
  count: number
  /** 占总数比例，0~1。页面直接拿来画条形宽度 */
  ratio: number
}

/**
 * topic 的单桶。刻意不复用 Bucket：一个仓库可以带多个 topic，
 * 拿仓库总数当分母算出来的「占比」加起来会超过 100%，是个会撒谎的数字。
 */
export interface TopicCount {
  name: string
  count: number
}

export interface CollectionStats {
  total: number
  /** 有语言标记的不同语言数（language 为 null 的不计，也进不了语言分布） */
  languageCount: number
  /** 最近 RECENT_WINDOW_DAYS 个 UTC 日（含今天）新增的 Star 数 */
  recent7: number
  /** 再往前整整一个窗口的新增数，用来和 recent7 比出趋势 */
  prev7: number
  cloned: number
  forked: number
  categorized: number
  uncategorized: number
  /** 所有仓库的 star 数之和 */
  totalStars: number
  avgStars: number
  /** 出现过的 topic 去重数 */
  topicCount: number
  /** 近 ACTIVE_WINDOW_DAYS 天内有 push */
  activeRecently: number
  /** 超过 STALE_WINDOW_DAYS 天没 push（pushed_at 为空的不算，那是「未知」不是「停更」） */
  stale: number
  /** pushed_at 为 null，拿不到活跃度 */
  unknownPush: number
  topLanguages: Bucket[]
  categories: Bucket[]
  topTopics: TopicCount[]
  topRepo: Repo | null
}

/** UTC 当日零点的时间戳 */
export function utcDayStart(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * UTC 日期 key，'YYYY-MM-DD'。
 *
 * 单独立出来是因为它是本项目的**日期坐标约定**：主进程 report.ts 的 dateKey、
 * 总览的趋势图、以及下面 starTrendBuckets 的分桶必须用同一个写法，
 * 否则东八区深夜收藏的记录会在两条路径上落到相邻两天，而两边的图"看着都正常"。
 */
export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * 「最近 N 天」的 N，指**含今天在内的 N 个 UTC 日历日**（不是"当前时刻往前推 N×24h"）。
 * 导出是为了让界面上的文案从这个数生成——改了窗口而文案没改，就是在骗人。
 */
export const RECENT_WINDOW_DAYS = 7

/** 最近这个窗口的起点。上一个窗口就是再往前整整一个窗口，别手算 13 天 */
function recentStart(now: number): number {
  return utcDayStart(now) - (RECENT_WINDOW_DAYS - 1) * DAY
}

/**
 * 按收藏时间分档，与 activityBucket 同一个思路：**阈值只有一处**。
 * 总览的「本周新增 / 上周」与列表的「只看最近 7 天新增」都走它，
 * 各写一遍 `>= todayStart - 6 * DAY` 迟早会漂，而漂了之后卡片写 5、点进去 3，
 * 两边都"看着对"。
 *
 * 'prevWeek' 只服务于趋势文案（比上周多/少），界面上没有对应的筛选——这与
 * activityBucket 里 'middle' 的处境一样，它必须存在，但不必做成一个选项。
 * 'unknown' 是 starred_at 解析不出来的，不计入任何一档。
 */
export type StarredBucket = 'week' | 'prevWeek' | 'earlier' | 'unknown'

export function starredBucket(repo: Repo, now: number): StarredBucket {
  const starredAt = safeTime(repo.starred_at)
  if (starredAt === null) return 'unknown'
  const start = recentStart(now)
  if (starredAt >= start) return 'week'
  if (starredAt >= start - RECENT_WINDOW_DAYS * DAY) return 'prevWeek'
  return 'earlier'
}

/** 趋势图上的一天 */
export interface TrendPoint {
  /** UTC 日期 'YYYY-MM-DD'（见 utcDayKey），也是去重的依据 */
  key: string
  /** 坐标轴上的 'MM-DD' */
  label: string
  count: number
}

/**
 * 「最近 RECENT_WINDOW_DAYS 天新增」折线图的数据。
 *
 * 它与「本周新增」卡片、列表的「只看最近 N 天新增」是**同一扇窗**：
 * 三条路径都从 RECENT_WINDOW_DAYS 出发，所以卡片写 5，图上加起来就该是 5。
 * 从组件里抽出来（原来是 StarTrendChart 的 useMemo）就是为了能断言这件事——
 * 渲染进程没有 DOM 测试环境，图表渲染不出来，但这条数可以在纯函数上卡住。
 *
 * ⚠️ 分桶必须**连续且补零**：缺一天折线就断（ECharts 的行为，不是我们的选择），
 * 所以空窗口也返回 RECENT_WINDOW_DAYS 个 0，而不是空数组。
 *
 * ⚠️ 与卡片的唯一差异：starred_at 落在**未来**的记录（时钟偏差）会被
 * 「本周新增」数进去，却落不进任何一个桶——最后一个桶是"今天"，图上没有"以后"。
 * 这是刻意保留的：为了迁就一条异常数据把坐标轴画到明天，代价更大。
 * 自检里有一条断言专门把这个差异钉住，免得哪天被当成 bug 顺手"修"掉。
 *
 * 与主进程 report.ts 的 dailyStarCount 是同一件东西的两种算法：那边给周报页用
 * （走 IPC 取），这边给总览页用（直接从 repos 现算，省一次往返、同步数据后立刻重绘）。
 */
export function starTrendBuckets(repos: Repo[], now: number): TrendPoint[] {
  const todayStart = utcDayStart(now)
  const points: TrendPoint[] = []
  const index = new Map<string, number>()
  for (let i = RECENT_WINDOW_DAYS - 1; i >= 0; i--) {
    const key = utcDayKey(todayStart - i * DAY)
    index.set(key, points.length)
    points.push({ key, label: key.slice(5), count: 0 })
  }
  for (const r of repos) {
    const t = safeTime(r.starred_at)
    if (t === null) continue
    const i = index.get(utcDayKey(t))
    if (i !== undefined) points[i]!.count += 1
  }
  return points
}

/**
 * 计数 → 降序排名。同数打平时按名称字典序，保证结果稳定可复现
 * （否则 Set/Map 的插入顺序会让同一份数据排出不同的名次）。
 */
function toBuckets(counts: Map<string, number>, total: number, limit: number): Bucket[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, ratio: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/** topic 排名：只要计数，不算占比（见 TopicCount 的说明） */
function toTopics(counts: Map<string, number>, limit: number): TopicCount[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** starred_at 可能被 mock 数据或异常接口写成非时间串，解析不出来的一律不算进趋势 */
function safeTime(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

export function computeCollectionStats(repos: Repo[], now: number): CollectionStats {
  const languageCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  const topicCounts = new Map<string, number>()

  let cloned = 0
  let forked = 0
  let categorized = 0
  let totalStars = 0
  let recent7 = 0
  let prev7 = 0
  let activeRecently = 0
  let stale = 0
  let unknownPush = 0

  for (const r of repos) {
    if (r.language !== null) bump(languageCounts, r.language)
    bump(categoryCounts, r.ai_category ?? UNCATEGORIZED_LABEL)
    for (const t of r.topics) bump(topicCounts, t)

    if (r.local?.cloned_path) cloned += 1
    if (r.local?.forked_full_name) forked += 1
    if (r.ai_category) categorized += 1
    totalStars += r.stargazers_count

    // 同样走 starredBucket：与列表的「只看最近 7 天新增」共用一处阈值
    switch (starredBucket(r, now)) {
      case 'week':
        recent7 += 1
        break
      case 'prevWeek':
        prev7 += 1
        break
      case 'earlier':
      case 'unknown':
        break
    }

    // 走 activityBucket 而不是在这里再判一次：阈值只有一处，
    // 列表筛选那边用同一个函数，卡片数字与筛出来的条数就不会对不上。
    switch (activityBucket(r, now)) {
      case 'unknown':
        unknownPush += 1
        break
      case 'stale':
        stale += 1
        break
      case 'active':
        activeRecently += 1
        break
      case 'middle':
        // ACTIVE_WINDOW_DAYS ~ STALE_WINDOW_DAYS 之间：两个数字都不算它，
        // 页面上也没有它对应的卡片
        break
    }
  }

  const total = repos.length
  const topRepo = repos.reduce<Repo | null>(
    (best, r) => (best === null || r.stargazers_count > best.stargazers_count ? r : best),
    null
  )

  return {
    total,
    languageCount: languageCounts.size,
    recent7,
    prev7,
    cloned,
    forked,
    categorized,
    uncategorized: total - categorized,
    totalStars,
    avgStars: total > 0 ? Math.round(totalStars / total) : 0,
    topicCount: topicCounts.size,
    activeRecently,
    stale,
    unknownPush,
    topLanguages: toBuckets(languageCounts, total, 6),
    // 分类固定按 7 个枚举 + 未分类的顺序呈现，不按票数排——这张表的语义是
    // 「七个桶各装了多少」，顺序跳来跳去反而难读。空桶也保留，好看出偏科。
    categories: categoryBucketsCount(categoryCounts, total),
    topTopics: toTopics(topicCounts, 12),
    topRepo
  }
}

function categoryBucketsCount(counts: Map<string, number>, total: number): Bucket[] {
  const names: string[] = [...AI_CATEGORIES, UNCATEGORIZED_LABEL]
  return names.map((name) => {
    const count = counts.get(name) ?? 0
    return { name, count, ratio: total > 0 ? count / total : 0 }
  })
}

/** 让页面判断分类名是不是真的枚举（决定要不要按分类色上色） */
export function isRealCategory(name: string): name is AiCategory {
  return (AI_CATEGORIES as readonly string[]).includes(name)
}

/**
 * 「未分类」这个桶的名字。它不是一个 AiCategory，但「分类分布」那张表要把它
 * 和其它 7 个一起列出来。单独导出是因为总览页要靠它认出那一行、接上下钻
 * （桶名 → 筛选态 'uncategorized' 的映射），写死在两处迟早会漂。
 */
export const UNCATEGORIZED_LABEL = '未分类'

/**
 * 把统计结果压成一段**给模型看的摘要**。
 *
 * 为什么在本地算好再喂给模型，而不是把仓库列表丢过去：
 * 「一共几个仓库、语言怎么分布」这类问题是**确定性**的，让模型去数几十上百条
 * 只会数错；它擅长的是解读倾向。所以这里把每个数字都算准，模型只负责说人话。
 *
 * 同时刻意只给**聚合数字**、几乎不给具体仓库名（只给一个最热的做锚点）——
 * 给的名字越多，模型越容易开始复述甚至编造项目。
 */
export function buildAiDigest(stats: CollectionStats, now: number): string {
  const date = new Date(now).toISOString().slice(0, 10)
  const lines: string[] = []

  lines.push(`收藏库统计（截至 ${date}）`)
  lines.push(`仓库总数：${stats.total}`)

  const langs = stats.topLanguages.map((b) => `${b.name} ${b.count}`).join('、')
  lines.push(`语言：共 ${stats.languageCount} 种${langs ? `；最多的是 ${langs}` : ''}`)

  // 只列**真分类**，未分类单独说一句。
  // 「未分类」桶在仓库非空时恒 > 0，把它混进这一行会让「一条都没分类」的情况也
  // 输出成「AI 分类分布：未分类 12」——标题写着"分布"，内容却是个空壳，
  // 模型完全看不出「这人还没跑过分类」。所以两者分开措辞。
  const cats = stats.categories
    .filter((b) => b.count > 0 && isRealCategory(b.name))
    .map((b) => `${b.name} ${b.count}`)
    .join('、')
  lines.push(
    cats
      ? `AI 分类分布：${cats}${stats.uncategorized > 0 ? `；另有 ${stats.uncategorized} 个未分类` : ''}`
      : 'AI 分类分布：（都还没分类）'
  )

  const topics = stats.topTopics
    .slice(0, 8)
    .map((t) => `${t.name} ${t.count}`)
    .join('、')
  lines.push(`主题标签：共 ${stats.topicCount} 个${topics ? `；高频的有 ${topics}` : ''}`)

  lines.push(`本周新增 ${stats.recent7} 个，上周 ${stats.prev7} 个`)
  lines.push(`星标总数 ${stats.totalStars}，平均每个 ${stats.avgStars}`)
  // 天数从常量拼出来，与总览卡片、筛选下拉的文案同源：
  // 摘要里写「90 天」而卡片按 60 天算，模型就会照着一个过期口径去解读。
  lines.push(
    `活跃度：${ACTIVE_WINDOW_DAYS} 天内有过提交的 ${stats.activeRecently} 个，` +
      `${STALE_WINDOW_DAYS} 天以上没提交的 ${stats.stale} 个` +
      (stats.unknownPush > 0 ? `，另有 ${stats.unknownPush} 个拿不到提交时间` : '')
  )
  lines.push(`本地操作：已 clone ${stats.cloned} 个，已 fork ${stats.forked} 个`)

  if (stats.topRepo !== null) {
    lines.push(`星标最多的一个：${stats.topRepo.full_name}（${stats.topRepo.stargazers_count} stars）`)
  }

  return lines.join('\n')
}
