/**
 * 周报页的派生数据（纯函数）。
 *
 * 单独成模块而不是写在 Report.tsx 里：这些函数决定「本周动态里到底显示哪几条」，
 * 边界（Release 发布时间刚好卡在周一/周日）在界面上完全看不出来——数字还是有，
 * 只是悄悄漏了一个。纯函数 + 显式传入时间窗口，自检可以直接喂假数据卡边界。
 *
 * ⚠️ 本文件**只依赖 @shared/types**，不 import lib/api（那个会拉进 React），
 * 这样自检脚本可以把本文件直接打包进 node 跑。
 */

import type { Release, Repo, WeeklyReport } from '@shared/types'

/** 查 Release 的并发。3 与 ai.enrichRepos、report.ts 同一个量级 */
export const RELEASE_CONCURRENCY = 3
/** 最多查几个仓库。每个仓库一次 REST 调用，收藏几百个时不能全查 */
export const WATCH_LIMIT = 10

/** 一条「本周发布了新版本」的记录 */
export interface ReleaseHit {
  fullName: string
  tag: string
  /** 上游没给 Release 起名时为 null */
  name: string | null
  publishedAt: string
  htmlUrl: string
}

/** 某个仓库查到的那一批 Release（查询结果原样带回来，挑选交给纯函数） */
export interface RepoReleaseEntry {
  fullName: string
  releases: Release[]
}

/**
 * 挑出要看 Release 的仓库：本周新增的排在前面（离「你为什么会收藏它」最近），
 * 再补上星标最多的几个（安静的一周也要有东西可看），去重后截断。
 *
 * 顺序有意义：超出 WATCH_LIMIT 时先丢掉星标榜尾部，而不是丢掉本周新增。
 */
export function pickWatchlist(report: WeeklyReport, limit = WATCH_LIMIT): Repo[] {
  const out: Repo[] = []
  const seen = new Set<string>()
  for (const r of [...report.newStars, ...report.topRepos]) {
    if (seen.has(r.full_name)) continue
    seen.add(r.full_name)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}

/**
 * 从查回来的 Release 里挑「发布窗口内、最新的那一个」。
 *
 * 只取最新一个：一个仓库一周发三个版本时全列出来会让周报变成 changelog，
 * 这里要的信号只是「它有动静」。
 *
 * 窗口用毫秒比较而不是字符串：published_at 的时区写法不受我们控制，
 * 字符串比较会把 '2026-10-02T00:00:00Z' 和 '2026-10-02T00:00:00+08:00' 判成不同时刻。
 * published_at 为空串（草稿 Release）的直接跳过——没有时间就没法判断在不在本周。
 */
export function pickLatestInWindow(
  entries: RepoReleaseEntry[],
  startMs: number,
  endMs: number
): ReleaseHit[] {
  const hits: ReleaseHit[] = []

  for (const entry of entries) {
    let best: Release | null = null
    let bestAt = -Infinity

    for (const r of entry.releases) {
      if (r.published_at === '') continue
      const at = new Date(r.published_at).getTime()
      if (!Number.isFinite(at)) continue
      if (at < startMs || at > endMs) continue
      if (at > bestAt) {
        best = r
        bestAt = at
      }
    }

    if (best !== null) {
      hits.push({
        fullName: entry.fullName,
        tag: best.tag_name,
        name: best.name,
        publishedAt: best.published_at,
        htmlUrl: best.html_url
      })
    }
  }

  // 新发的排前面。同一时刻（真实数据里几乎不会发生）按仓库名兜底，保证顺序稳定
  return hits.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
      a.fullName.localeCompare(b.fullName)
  )
}

/**
 * 本周新增 Star 的分类分布。
 *
 * 与周报里那张「语言分布」图不同：那张图画的是**全部收藏**的语言构成，
 * 是存量；这张说的是**这周新收的**都落在哪些方向，是增量——
 * 两者回答的问题不一样，所以并存而不是替换。
 */
export function weekCategoryStats(newStars: Repo[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of newStars) {
    // 还没跑过 AI 补全的仓库用「未分类」，不要混进某个真分类里
    const key = r.ai_category ?? '未分类'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
