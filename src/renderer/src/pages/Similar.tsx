import { EmptyState } from '../components/common/EmptyState'

/**
 * 猜你喜欢（占位）。
 *
 * 通道与 preload 早就通了，缺的是主进程 `recommend.similar` 的真实实现（现在是
 * `throw NOT_IMPLEMENTED`），也一并放在 PR 4。
 */
export function Similar(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">猜你喜欢</h1>
        <p className="mt-1 text-sm text-fg-muted">根据你已经 Star 的仓库，找出风格相近的项目</p>
      </header>
      <EmptyState title="还没接入" description="相似仓库推荐将在后续提交里补齐" />
    </div>
  )
}
