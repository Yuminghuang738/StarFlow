// 接口规格见 docs/module-signatures.md（冻结）
// 这是骨架里唯一"提前实现"的业务逻辑——因为周报页需要有东西可渲染。

import type { WeeklyReport } from '@shared/types'
import * as ai from './ai'
import * as store from './store'

const DAY = 86400000

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

  const aiSummary = await ai.generateReport(newStars.map((r) => r))

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
