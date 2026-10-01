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
    <Card className="flex flex-col transition-colors hover:border-sky-500/50">
      <div className="flex items-start justify-between gap-3">
        <a
          href={repo.html_url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 break-all font-medium text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          title={repo.full_name}
        >
          {repo.full_name}
        </a>
        <span className="shrink-0 text-xs tabular-nums text-slate-400">
          ★ {formatStars(repo.stargazers_count)}
        </span>
      </div>

      {repo.description === null ? (
        <p className="mt-2 line-clamp-2 text-sm italic text-slate-500">暂无描述</p>
      ) : (
        <p className="mt-2 line-clamp-2 text-sm text-slate-400">{repo.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: languageColor(repo.language) }}
            aria-hidden="true"
          />
          {repo.language ?? '未知语言'}
        </span>

        {category ? (
          <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-300">
            {category}
          </span>
        ) : (
          <span className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-slate-400">
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
              className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
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
