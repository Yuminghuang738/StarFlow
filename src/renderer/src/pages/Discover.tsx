import { EmptyState } from '../components/common/EmptyState'

/**
 * 仓库推荐（占位）。
 *
 * PR 2 只把导航位和 keep-alive 链路接通，内容留给 PR 4——那需要先有
 * `github.searchRepos` / `github.star` 两个后端能力和推荐态 store。
 */
export function Discover(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">仓库推荐</h1>
        <p className="mt-1 text-sm text-fg-muted">用一句话描述你要找什么，AI 会把它翻成 GitHub 搜索条件</p>
      </header>
      <EmptyState title="还没接入" description="这个板块的搜索与 Star 功能将在后续提交里补齐" />
    </div>
  )
}
