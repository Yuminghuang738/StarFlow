import type { Repo } from '@shared/types'
import { useRepoStore } from '../../store/repoStore'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { SKELETON_COUNT } from '../common/SkeletonCard'
import { RepoRow } from './RepoRow'

export interface RepoListProps {
  /** 已经由上层页面（Manage）用 filterRepos(repos, filters) 算好的可见列表 */
  visible: Repo[]
}

/**
 * 仓库列表容器：一条横线隔开一行一个仓库（GitHub 仓库列表的样子）。
 *
 * 边框与圆角只画在**外层容器**上，行自己不画——这样连续的行才会读成一个列表，
 * 而不是一叠各自为政的卡片。分隔线用 border-b + last:border-b-0，
 * 最后一行不会多出一条贴底的线。
 *
 * 注意：筛选结果由上层传进来，而不是在这里调 visibleRepos()——
 * visibleRepos() 每次返回新数组，在组件里订阅它会触发 zustand v5 的无限重渲染。
 */
export function RepoList({ visible }: RepoListProps): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const loading = useRepoStore((s) => s.loading)
  const setFilters = useRepoStore((s) => s.setFilters)

  // ① 首次加载：还没有任何数据，用横条骨架顶着。
  // 不复用 SkeletonCard：那是给「为你推荐 / 发现仓库」两张卡片用的方块骨架，
  // 塞进列表里会先闪一片方块再变成横条，反而像布局跳了一下。
  if (loading && repos.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div
            key={`skeleton-${i}`}
            className="animate-pulse border-b border-border px-4 py-3.5 last:border-b-0"
            aria-hidden
          >
            <div className="h-4 w-48 rounded bg-surface-2" />
            <div className="mt-2 h-3 w-3/4 rounded bg-surface-2" />
            <div className="mt-2 h-3 w-40 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    )
  }

  // ② 一条数据都没有：引导去设置页同步
  if (repos.length === 0) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-fg-muted">还没有数据</p>
        <p className="mt-2 text-xs text-fg-subtle">
          先到「设置」页配置 GitHub Token，再点「从 GitHub 同步」把 Star 列表拉下来。
        </p>
      </Card>
    )
  }

  // ③ 有数据但被筛没了：给出重置入口
  if (visible.length === 0) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-fg-muted">没有符合条件的仓库</p>
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
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {visible.map((r, i) => (
        <RepoRow key={r.id} repo={r} index={i} />
      ))}
    </div>
  )
}
