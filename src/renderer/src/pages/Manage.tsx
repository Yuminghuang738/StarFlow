import { useMemo, useState } from 'react'
import { useRepoStore, filterRepos } from '../store/repoStore'
import { Button } from '../components/common/Button'
import { FilterBar } from '../components/repo/FilterBar'
import { RepoList } from '../components/repo/RepoList'

/**
 * Star 管理：筛选 + 列表 + 批量操作（同步 / AI 补全）。
 *
 * ⚠️ 这里**不**调 `load()`，初始加载统一在 App.tsx 里跑一次（原因见 Overview 顶部注释）。
 * 同步 / 补全按钮本身不涉及初始加载，留在本页是对的——它们是明确的用户动作。
 */
export function Manage(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const filters = useRepoStore((s) => s.filters)
  const loading = useRepoStore((s) => s.loading)
  const refreshFromGitHub = useRepoStore((s) => s.refreshFromGitHub)
  const enrich = useRepoStore((s) => s.enrich)

  // 注意不要写成 useRepoStore((s) => s.visibleRepos())：visibleRepos() 每次返回新数组，
  // zustand v5 的 useSyncExternalStore 用严格相等比较快照，会判定值一直在变而无限重渲染。
  // 正确做法是订阅它依赖的两个切片，再用同一个纯函数算（filters 因此是真实的依赖）。
  const visible = useMemo(() => filterRepos(repos, filters), [repos, filters])

  // 两个按钮各自维护忙碌态。
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold">Star 管理</h1>
          <span className="rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-fg-muted">
            {visible.length} / {repos.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => void onRefresh()} disabled={headerBusy}>
            {syncBusy ? '同步中…' : '从 GitHub 同步'}
          </Button>
          <Button onClick={() => void onEnrich()} disabled={headerBusy}>
            {enrichBusy ? '补全中…' : 'AI 补全分类'}
          </Button>
        </div>
      </header>

      <FilterBar />

      <RepoList visible={visible} />
    </div>
  )
}
