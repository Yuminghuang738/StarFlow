import type { Repo } from '@shared/types'
import { useRepoStore } from '../../store/repoStore'
import { DEFAULT_FILTERS } from '../../lib/repoQuery'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { SKELETON_COUNT } from '../common/SkeletonCard'
import { RepoRow } from './RepoRow'

export interface RepoListProps {
  /** 已经由上层页面（Manage）用 selectRepos(repos, filters, now) 算好的可见列表 */
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
  const error = useRepoStore((s) => s.loadError)
  const load = useRepoStore((s) => s.load)
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

  // ② 一条数据都没有：**先分清"读失败"和"确实没有"**。
  // 这两件事在界面上曾经长得一模一样（都落到下面那个"还没有数据"），而给用户的
  // 下一步动作正好相反：读失败要重试，确实没有才该去配 Token。把一次失败的读取
  // 说成"你的收藏是空的"，就是本项目最忌讳的那类谎。
  if (repos.length === 0) {
    if (error !== null) {
      return (
        <Card className="py-10 text-center">
          <p className="text-sm text-danger">读取本地数据失败</p>
          {/* 原文照登：这句话里有真正的原因（文件损坏 / 权限 / 主进程没起来），
              概括成"出错了"等于把它扔掉 */}
          <p className="mx-auto mt-2 max-w-lg break-words text-xs text-fg-subtle">{error}</p>
          <p className="mt-2 text-xs text-fg-muted">
            这不代表你的收藏是空的——是这一次没读到。本地数据都在，重试一下。
          </p>
          <Button size="sm" variant="primary" className="mt-3" onClick={() => void load()}>
            重试
          </Button>
        </Card>
      )
    }
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
          // 走 DEFAULT_FILTERS 而不是手写一份字段列表：这里原本是第三处手写清单，
          // 上一轮加 sort 时就被漏掉了（重置之后排序仍是用户选的那个）。
          // 少一处手写清单，就少一次这种静默漂移。
          onClick={() => setFilters({ ...DEFAULT_FILTERS })}
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
