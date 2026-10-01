import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepoStore, filterRepos } from '../store/repoStore'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { FilterBar } from '../components/repo/FilterBar'
import { RepoList } from '../components/repo/RepoList'
import { LanguagePie } from '../components/charts/LanguagePie'
import { StarTrendChart } from '../components/charts/StarTrendChart'

const DAY = 86_400_000

/** 统计卡片：宽屏四个一行，窄屏两列 */
function StatCard({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <Card className="min-w-0">
      <div className="text-2xl font-semibold tabular-nums text-fg">{value}</div>
      <div className="mt-1 truncate text-xs text-fg-muted">{label}</div>
    </Card>
  )
}

export function Dashboard(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const loading = useRepoStore((s) => s.loading)
  const filters = useRepoStore((s) => s.filters)
  const load = useRepoStore((s) => s.load)
  const refreshFromGitHub = useRepoStore((s) => s.refreshFromGitHub)
  const enrich = useRepoStore((s) => s.enrich)

  // 注意不要写成 useRepoStore((s) => s.visibleRepos())：visibleRepos() 每次返回新数组，
  // zustand v5 的 useSyncExternalStore 用严格相等比较快照，会判定值一直在变而无限重渲染。
  // 正确做法是订阅它依赖的两个切片，再用同一个纯函数算（filters 因此是真实的依赖）。
  const visible = useMemo(() => filterRepos(repos, filters), [repos, filters])

  // 挂载时加载一次。用 ref 兜住重复挂载，避免在重复执行 effect 的环境下白拉两遍数据。
  const loadedOnce = useRef(false)
  useEffect(() => {
    if (loadedOnce.current) return
    loadedOnce.current = true
    void load()
  }, [load])

  // 顶部两个按钮各自维护忙碌态。
  // 不能直接用 store 的 loading 决定文案：loading 是全局的，点「同步」时
  // 「AI 补全分类」也会被算成 busy 而显示成"补全中…"，两个按钮的文案会错配。
  const [syncBusy, setSyncBusy] = useState(false)
  const [enrichBusy, setEnrichBusy] = useState(false)
  // 任一在跑就都禁用，避免两个操作并发（store 的 loading 也会兜住 UI 状态）
  const headerBusy = loading || syncBusy || enrichBusy

  async function onRefresh(): Promise<void> {
    setSyncBusy(true)
    try {
      await refreshFromGitHub()
    } finally {
      setSyncBusy(false)
    }
  }

  async function onEnrich(): Promise<void> {
    setEnrichBusy(true)
    try {
      await enrich()
    } finally {
      setEnrichBusy(false)
    }
  }

  const stats = useMemo(() => {
    const languageSet = new Set<string>()
    let cloned = 0
    for (const r of repos) {
      if (r.language !== null) languageSet.add(r.language)
      if (r.local?.cloned_path) cloned += 1
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

    return { total: repos.length, languages: languageSet.size, recent, cloned }
  }, [repos])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold">我的 Star</h1>
          <span className="rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-fg-muted">
            {stats.total}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => void onRefresh()}
            disabled={headerBusy}
          >
            {syncBusy ? '同步中…' : '从 GitHub 同步'}
          </Button>
          <Button onClick={() => void onEnrich()} disabled={headerBusy}>
            {enrichBusy ? '补全中…' : 'AI 补全分类'}
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="仓库总数" value={stats.total} />
        <StatCard label="语言数" value={stats.languages} />
        <StatCard label="本周新增" value={stats.recent} />
        <StatCard label="已 Clone" value={stats.cloned} />
      </section>

      <FilterBar />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LanguagePie />
        <StarTrendChart />
      </section>

      <RepoList visible={visible} />
    </div>
  )
}
