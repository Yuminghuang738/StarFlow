import type { Repo } from '@shared/types'
import { useRepoStore } from '../../store/repoStore'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { RepoCard } from './RepoCard'

const SKELETON_COUNT = 6

/** 骨架卡片：用 animate-pulse 的灰块占位，避免首屏白屏 */
function SkeletonCard(): React.JSX.Element {
  return (
    <Card className="flex animate-pulse flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="h-4 w-40 rounded bg-slate-800" />
        <div className="h-3 w-10 rounded bg-slate-800" />
      </div>
      <div className="mt-3 h-3 w-full rounded bg-slate-800" />
      <div className="mt-2 h-3 w-2/3 rounded bg-slate-800" />
      <div className="mt-4 flex gap-2">
        <div className="h-3 w-16 rounded bg-slate-800" />
        <div className="h-3 w-12 rounded bg-slate-800" />
        <div className="h-3 w-20 rounded bg-slate-800" />
      </div>
      <div className="mt-auto flex gap-2 pt-5">
        <div className="h-6 w-16 rounded bg-slate-800" />
        <div className="h-6 w-14 rounded bg-slate-800" />
        <div className="h-6 w-14 rounded bg-slate-800" />
      </div>
    </Card>
  )
}

export interface RepoListProps {
  /** 已经由 Dashboard 用 filterRepos(repos, filters) 算好的可见列表 */
  visible: Repo[]
}

/**
 * 仓库列表容器，负责三种空态与骨架屏。
 *
 * 注意：筛选结果由上层传进来，而不是在这里调 visibleRepos()——
 * visibleRepos() 每次返回新数组，在组件里订阅它会触发 zustand v5 的无限重渲染。
 */
export function RepoList({ visible }: RepoListProps): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const loading = useRepoStore((s) => s.loading)
  const setFilters = useRepoStore((s) => s.setFilters)

  const gridClass = 'grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3'

  // ① 首次加载：还没有任何数据，用骨架屏顶着
  if (loading && repos.length === 0) {
    return (
      <div className={gridClass}>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <SkeletonCard key={`skeleton-${i}`} />
        ))}
      </div>
    )
  }

  // ② 一条数据都没有：引导去设置页同步
  if (repos.length === 0) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-slate-300">还没有数据</p>
        <p className="mt-2 text-xs text-slate-500">
          先到「设置」页配置 GitHub Token，再点「从 GitHub 同步」把 Star 列表拉下来。
        </p>
      </Card>
    )
  }

  // ③ 有数据但被筛没了：给出重置入口
  if (visible.length === 0) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-slate-300">没有符合条件的仓库</p>
        <Button
          size="sm"
          variant="primary"
          className="mt-3"
          onClick={() => setFilters({ keyword: '', language: null, category: null, onlyCloned: false })}
        >
          重置筛选
        </Button>
      </Card>
    )
  }

  // ④ 正常渲染。key 用 repo.id，卸载/重排都不会错位
  return (
    <div className={gridClass}>
      {visible.map((r) => (
        <RepoCard key={r.id} repo={r} />
      ))}
    </div>
  )
}
