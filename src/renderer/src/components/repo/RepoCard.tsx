import type { Repo } from '@shared/types'
import { Card } from '../common/Card'
import { RepoActions } from './RepoActions'
import { formatRelative, formatStars, languageColor } from './repoFormat'

/**
 * 单张仓库卡片。
 * 展示：full_name 外链、描述、语言色块、星标数、AI 分类徽章、前 3 个 topics、starred_at 相对时间。
 * 底部操作按钮见 RepoActions（Toast 由 store 负责，这里不弹）。
 */
export function RepoCard({ repo }: { repo: Repo }): React.JSX.Element {
  const topics = repo.topics.slice(0, 3)
  const category = repo.ai_category

  return (
    <Card className="flex flex-col transition-colors hover:border-primary/50">
      <div className="flex items-start justify-between gap-3">
        {/* 悬停只加下划线、不改颜色：原先是 hover:text-sky-300（暗底上变亮），
            换成语义 token 之后没有对应的「更亮」档，写 /90 反而会让它变淡。 */}
        <a
          href={repo.html_url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 break-all font-medium text-link underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          title={repo.full_name}
        >
          {repo.full_name}
        </a>
        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
          ★ {formatStars(repo.stargazers_count)}
        </span>
      </div>

      {repo.description === null ? (
        <p className="mt-2 line-clamp-2 text-sm italic text-fg-subtle">暂无描述</p>
      ) : (
        <p className="mt-2 line-clamp-2 text-sm text-fg-muted">{repo.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
            style={{ backgroundColor: languageColor(repo.language) }}
            aria-hidden="true"
          />
          {repo.language ?? '未知语言'}
        </span>

        {category ? (
          <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">
            {category}
          </span>
        ) : (
          <span className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 text-fg-muted">
            未分类
          </span>
        )}

        <span title={repo.starred_at}>{formatRelative(repo.starred_at)} Star</span>
      </div>

      {topics.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <span
              key={t}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto pt-4">
        <RepoActions repo={repo} />
      </div>
    </Card>
  )
}
