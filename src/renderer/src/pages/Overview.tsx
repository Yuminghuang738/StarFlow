import { useMemo } from 'react'
import { useRepoStore } from '../store/repoStore'
import { Card } from '../components/common/Card'
import { LanguagePie } from '../components/charts/LanguagePie'
import { StarTrendChart } from '../components/charts/StarTrendChart'

const DAY = 86_400_000

function StatCard({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <Card className="min-w-0 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="text-2xl font-semibold tabular-nums text-fg">{value}</div>
      <div className="mt-1 truncate text-xs text-fg-muted">{label}</div>
    </Card>
  )
}

/**
 * Star 总览：统计卡片 + 两个图表。
 *
 * ⚠️ 这里**不**调 `load()`。初始加载已经提到 App.tsx 里全局跑一次了——
 * 总览和管理页拆开之后，两边各留一份就是双重拉取 + 双重 prune IPC
 *（store.load() 末尾折着本地副本对账）。
 */
export function Overview(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)

  const stats = useMemo(() => {
    const languageSet = new Set<string>()
    let cloned = 0
    let uncategorized = 0
    for (const r of repos) {
      if (r.language !== null) languageSet.add(r.language)
      if (r.local?.cloned_path) cloned += 1
      if (!r.ai_category) uncategorized += 1
    }

    // 本周新增 = starred_at 落在最近 7 天内的数量。
    // ⚠️ 用 UTC 的日历天算，和 Repo.starred_at（UTC ISO 8601）、主进程 report.ts 同口径；
    // 用本地时间算会让东八区深夜的记录前后差一天。
    const now = new Date()
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const windowStart = todayStart - 6 * DAY
    const recent = repos.filter((r) => {
      const t = new Date(r.starred_at).getTime()
      return Number.isFinite(t) && t >= windowStart
    }).length

    return { total: repos.length, languages: languageSet.size, recent, cloned, uncategorized }
  }, [repos])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* 这一层渐变光斑是整页唯一的装饰性用色，压得很淡：太浓会和图表抢注意力 */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent opacity-[0.14] blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Star 总览</h1>
            <p className="mt-1 text-sm text-fg-muted">
              你已经收藏了 <span className="font-medium text-primary">{stats.total}</span> 个仓库
            </p>
          </div>
          {stats.uncategorized > 0 ? (
            <p className="text-xs text-fg-subtle">
              还有 {stats.uncategorized} 个未分类，可到「Star 管理」跑一次 AI 补全
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="仓库总数" value={stats.total} />
        <StatCard label="语言数" value={stats.languages} />
        <StatCard label="本周新增" value={stats.recent} />
        <StatCard label="已 Clone" value={stats.cloned} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LanguagePie />
        <StarTrendChart />
      </section>
    </div>
  )
}
