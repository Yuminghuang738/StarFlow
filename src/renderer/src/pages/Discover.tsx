import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRecommendStore } from '../store/recommendStore'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Input } from '../components/common/Input'
import { EmptyState } from '../components/common/EmptyState'
import { SkeletonCard, SKELETON_COUNT } from '../components/common/SkeletonCard'
import { RecommendRepoCard } from '../components/repo/RecommendRepoCard'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'

/** 空态给的几个例句：比让用户对着空输入框想词有效得多 */
const EXAMPLES = [
  '能离线跑的中文 OCR 库',
  '轻量的 React 状态管理',
  'Rust 写的终端编辑器',
  '好上手的 Kubernetes 教程'
]

/**
 * 发现仓库：一句话 → AI 翻译成搜索条件 → GitHub 搜索 → 结果可直接 Star。
 *
 * 输入与结果都放在 recommendStore（模块级），所以切到别的板块再切回来，
 * 输入框和上一次的结果都还在。
 *
 * 结果列表可以放心用 AnimatePresence：它按查询**真挂载/卸载**，与页面级保活不冲突
 * （页面级是禁止用 AnimatePresence 的，见 App.tsx 的说明）。
 */
export function Discover(): React.JSX.Element {
  const query = useRecommendStore((s) => s.query)
  const searchedQuery = useRecommendStore((s) => s.searchedQuery)
  const results = useRecommendStore((s) => s.results)
  const searching = useRecommendStore((s) => s.searching)
  const searchError = useRecommendStore((s) => s.searchError)
  const search = useRecommendStore((s) => s.search)

  // 输入框是受控的，但只在提交时真正搜；所以要一个本地态承接"正在输入"
  const [draft, setDraft] = useState(query)

  function run(q: string): void {
    setDraft(q)
    void search(q)
  }

  return (
    <PageContainer>
      <PageHeader
        tab="recommend"
        title="发现仓库"
        subtitle="用一句话描述你要找什么，AI 把它翻成 GitHub 搜索条件，结果可以直接 Star"
      />

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(draft)
        }}
      >
        <Input
          size="md"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="例如：能离线跑的中文 OCR 库"
          aria-label="描述你想找的仓库"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="primary" loading={searching} disabled={draft.trim() === ''}>
          搜索
        </Button>
      </form>

      {searchError === null ? null : (
        <Card className="border-danger/40">
          <p className="text-sm text-danger">{searchError}</p>
          <p className="mt-1 text-xs text-fg-subtle">
            没有配置 GitHub Token、或撞上搜索接口的限频（约 30 次/分钟）是最常见的两个原因。
          </p>
        </Card>
      )}

      {searching ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <SkeletonCard key={`searching-${i}`} />
          ))}
        </div>
      ) : searchedQuery === null ? (
        <EmptyState
          title="还没有搜索"
          description="没配 AI Key 也能用：那种情况下会直接拿你这句话去搜"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <Button key={ex} size="sm" variant="ghost" onClick={() => run(ex)}>
                  {ex}
                </Button>
              ))}
            </div>
          }
        />
      ) : results.length === 0 ? (
        // ⚠️ 必须先看 searchError：出错时 store 会把 results 置空，
        // 只看长度的话，下面那张红色报错卡的正下方会再长出一条
        // 「没有找到与「q」匹配的仓库 / 换个说法试试」——把"根本没搜成"
        // 说成"搜了但没结果"，用户于是去改词，而问题在于 Token 或限频。
        // 口径与 Similar.tsx 对齐：没结果和没搜成是两种空态。
        <EmptyState
          title={
            searchError === null
              ? `没有找到与「${searchedQuery}」匹配的仓库`
              : `「${searchedQuery}」这次没能搜成`
          }
          description={
            searchError === null
              ? '换个说法试试；已经 Star 过的仓库不会再出现在结果里'
              : '先解决上面的报错（多半是 Token 或限频），再搜一次'
          }
          action={
            searchError === null ? (
              <Button size="sm" variant="ghost" onClick={() => run(EXAMPLES[0] ?? '')}>
                试试示例
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-xs text-fg-subtle">
            按「{searchedQuery}」找到 {results.length} 个仓库
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {results.map((r) => (
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
    </PageContainer>
  )
}
