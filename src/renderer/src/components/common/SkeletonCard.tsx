import { Card } from './Card'

/** 骨架卡片数量：一行 3 列时正好铺满两行，不至于只出现半行 */
export const SKELETON_COUNT = 6

/**
 * 首屏加载占位。从 RepoList 里抽出来是因为 PR 4 的推荐结果列表也要用同一套占位，
 * 两边各写一份必然会漂移。
 */
export function SkeletonCard(): React.JSX.Element {
  return (
    <Card className="flex animate-pulse flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="h-4 w-40 rounded bg-surface-2" />
        <div className="h-3 w-10 rounded bg-surface-2" />
      </div>
      <div className="mt-3 h-3 w-full rounded bg-surface-2" />
      <div className="mt-2 h-3 w-2/3 rounded bg-surface-2" />
      <div className="mt-4 flex gap-2">
        <div className="h-3 w-16 rounded bg-surface-2" />
        <div className="h-3 w-12 rounded bg-surface-2" />
        <div className="h-3 w-20 rounded bg-surface-2" />
      </div>
      <div className="mt-auto flex gap-2 pt-5">
        <div className="h-6 w-16 rounded bg-surface-2" />
        <div className="h-6 w-14 rounded bg-surface-2" />
        <div className="h-6 w-14 rounded bg-surface-2" />
      </div>
    </Card>
  )
}
