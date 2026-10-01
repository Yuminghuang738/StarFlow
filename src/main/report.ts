// 接口规格见 docs/module-signatures.md（冻结）
// 这是骨架里唯一"提前实现"的业务逻辑——因为周报页需要有东西可渲染。

import type { WeeklyReport } from '@shared/types'
import type { RepoRelease } from './ai-prompts'
import * as ai from './ai'
import * as github from './github'
import * as store from './store'

const DAY = 86400000

/**
 * 周报里最多查几个仓库的 Release。
 * 每个仓库一次 REST 调用，不能无上限——收藏几百个的话全查一遍就是几百次请求。
 * 只查「本周新 Star 的」：它们离"你为什么会收藏它"最近，也正是要看动态的那批。
 */
const RELEASE_WATCH_LIMIT = 8
/** 查 Release 的并发。取 3：与 ai.enrichRepos 同一个量级，不追求更快，只求不打爆限频 */
const RELEASE_CONCURRENCY = 3

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** 本周一 00:00:00.000（UTC；与 starred_at 的存储口径保持一致） */
function startOfWeek(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = d.getUTCDay() // 0 = 周日
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
  return d
}

export async function generate(): Promise<WeeklyReport> {
  const repos = await store.getRepos()
  const now = new Date()

  const weekStart = startOfWeek(now)
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY - 1) // 周日 23:59:59.999

  const newStars = repos
    .filter((r) => {
      const t = new Date(r.starred_at).getTime()
      return t >= weekStart.getTime() && t <= weekEnd.getTime()
    })
    .sort((a, b) => new Date(b.starred_at).getTime() - new Date(a.starred_at).getTime())

  const languageStats: Record<string, number> = {}
  for (const r of repos) {
    const key = r.language ?? '未知'
    languageStats[key] = (languageStats[key] ?? 0) + 1
  }

  // 最近 7 天必须补齐 7 个连续日期、缺的补 0，否则 ECharts 折线会断点。
  // 注意口径：全程 UTC，与 starred_at 一致；不要改成按本地时间格式化日期 key。
  //
  // ⚠️ 这里的 7 是**从今天往回数的滚动 7 天**，与同一页的「本周新增 Star」卡
  // （newStars，本周一 00:00 UTC 起）**不是同一扇窗**——只有恰好周日两者才相等。
  // 界面上那张图的标题因此写的是「最近 7 天」而不是「本周」，见 Report.tsx。
  // 想改成日历周的话要连着卡片口径一起改，否则同页两个"周"会互相打脸。
  // 天数与 collectionStats 的 RECENT_WINDOW_DAYS 是同一个窗口（渲染进程那边
  // 的 starTrendBuckets 是它的纯函数版），改这里记得一起改。
  const dailyStarCount: Record<string, number> = {}
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = 6; i >= 0; i--) {
    dailyStarCount[dateKey(new Date(todayStart - i * DAY))] = 0
  }
  for (const r of repos) {
    const key = dateKey(new Date(r.starred_at))
    if (key in dailyStarCount) {
      dailyStarCount[key] += 1
    }
  }

  const topRepos = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 5)

  // 本周这些仓库发了新版本吗——周报要回答的是「我关注的东西这周发生了什么」，
  // 光有「我新收藏了什么」是不够的
  const weekReleases = await collectWeekReleases(newStars, weekStart.getTime(), weekEnd.getTime())

  const aiSummary = await ai.generateReport(
    newStars.map((r) => r),
    weekReleases
  )

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    newStars,
    languageStats,
    dailyStarCount,
    topRepos,
    aiSummary
  }
}

/**
 * 查「本周新 Star 的仓库里，哪些这周发了 Release」。
 *
 * 三个刻意的取舍：
 *   1. **只取最新的那个 Release**。一个仓库一周发三个版本时，全列出来只会让
 *      周报变成 changelog；模型需要的信号是"它有动静"。
 *   2. **失败就跳过这个仓库**，绝不让整份周报挂掉。没有 Token、仓库被删、
 *      限频，都会让单个请求失败，而周报的主体（新增列表、图表）跟它无关。
 *      所以这里连 client() 抛错都吞——collectWeekReleases 永远返回数组。
 *   3. **串行分片而不是 Promise.all**：一次放 3 个出去，等这一批完了再放下一批。
 *      全并发的话收藏一多就会撞 GitHub 的二级限频。
 */
async function collectWeekReleases(
  repos: { full_name: string }[],
  weekStartMs: number,
  weekEndMs: number
): Promise<RepoRelease[]> {
  const targets = repos.slice(0, RELEASE_WATCH_LIMIT).map((r) => r.full_name)
  const out: RepoRelease[] = []

  for (let i = 0; i < targets.length; i += RELEASE_CONCURRENCY) {
    const batch = targets.slice(i, i + RELEASE_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (fullName): Promise<RepoRelease | null> => {
        try {
          const releases = await github.fetchReleases(fullName)
          // 上游返回的顺序不保证，自己按发布时间挑最新的一个
          const latest = releases
            .filter((r) => r.published_at !== '')
            .sort(
              (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
            )[0]
          if (!latest) return null

          const at = new Date(latest.published_at).getTime()
          if (!Number.isFinite(at) || at < weekStartMs || at > weekEndMs) return null

          return {
            fullName,
            tag: latest.tag_name,
            name: latest.name,
            publishedAt: latest.published_at,
            htmlUrl: latest.html_url
          }
        } catch (err) {
          // 单个仓库查不到不影响周报本身，留一行日志就够（这里也不该弹 toast）
          console.log(`[report] 跳过 ${fullName} 的 Release：${err instanceof Error ? err.message : err}`)
          return null
        }
      })
    )
    for (const r of results) if (r !== null) out.push(r)
  }

  return out
}
