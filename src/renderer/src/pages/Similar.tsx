import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRepoStore } from '../store/repoStore'
import { useRecommendStore } from '../store/recommendStore'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Select } from '../components/common/Select'
import { EmptyState } from '../components/common/EmptyState'
import { SkeletonCard, SKELETON_COUNT } from '../components/common/SkeletonCard'
import { RecommendRepoCard } from '../components/repo/RecommendRepoCard'

/**
 * 猜你喜欢：以某个已 Star 的仓库为种子，找出风格相近的项目。
 *
 * 主进程只用本地语料的信号（topics / language / 分类）拼查询，**不调 AI**，
 * 所以只要有 GitHub Token 就能用。
 *
 * 不做「进页面就自动搜」：那会让用户只是点一下侧边栏就发出一次网络请求——
 * 撞上限频或没配 Token 时，错误 toast 会显得莫名其妙。改成显式的按钮。
 */
export function Similar(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)

  const similarFor = useRecommendStore((s) => s.similarFor)
  const similarResults = useRecommendStore((s) => s.similarResults)
  const similarLoading = useRecommendStore((s) => s.similarLoading)
  const similarError = useRecommendStore((s) => s.similarError)
  const loadSimilar = useRecommendStore((s) => s.loadSimilar)

  // repos 的顺序就是 starred_at 倒序，默认选最近 Star 的那个
  const [seed, setSeed] = useState('')
  const selected = seed !== '' ? seed : (repos[0]?.full_name ?? '')
  // 结果属于"上一次真正搜过的那个仓库"，所以标题以 similarFor 为准；
  // 只改了下拉框还没点按钮时，显示的仍然是已有结果对应的仓库（诚实）。
  const shownSeed = similarFor ?? selected

  if (repos.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header>
          <h1 className="text-xl font-semibold">猜你喜欢</h1>
          <p className="mt-1 text-sm text-fg-muted">根据你已经 Star 的仓库，找出风格相近的项目</p>
        </header>
        <EmptyState
          title="还没有可以参照的仓库"
          description="先到「设置」页配好 GitHub Token，再到「Star 管理」同步一次你的 Star 列表"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">猜你喜欢</h1>
        <p className="mt-1 text-sm text-fg-muted">
          以某个已 Star 的仓库为参照，找出语言、主题标签相近的项目
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          size="md"
          value={selected}
          onChange={(e) => setSeed(e.target.value)}
          aria-label="选择参照仓库"
          className="max-w-full"
        >
          {repos.map((r) => (
            <option key={r.full_name} value={r.full_name}>
              {r.full_name}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          loading={similarLoading}
          disabled={selected === ''}
          onClick={() => void loadSimilar(selected)}
        >
          找相似
        </Button>
      </div>

      {similarError === null ? null : (
        <Card className="border-danger/40">
          <p className="text-sm text-danger">{similarError}</p>
        </Card>
      )}

      {similarLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <SkeletonCard key={`similar-${i}`} />
          ))}
        </div>
      ) : similarResults.length === 0 ? (
        <EmptyState
          title={similarFor === null ? '挑一个仓库作为参照' : '这个仓库暂时没找出相似的'}
          description={
            similarFor === null
              ? '选好之后点「找相似」，结果里可以直接 Star'
              : '它的 topics 或语言太冷门时容易搜不到，换一个仓库试试'
          }
        />
      ) : (
        <>
          <p className="text-xs text-fg-subtle">
            与「{shownSeed}」相似 · 共 {similarResults.length} 个
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {similarResults.map((r) => (
                <motion.div
                  key={r.full_name}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  <RecommendRepoCard repo={r} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}
