import { useState } from 'react'
import type { Repo } from '@shared/types'
import { useRepoStore } from '../../store/repoStore'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { formatStars, languageColor } from './repoFormat'

/**
 * 推荐结果卡片。
 *
 * **刻意不复用 RepoCard**：那张卡永远渲染 Unstar / Fork / Clone，对"还没 Star 过
 * 的仓库"是错的——点 Unstar 会去取消一个根本不存在的 Star。这里只放一个动作。
 *
 * ⚠️ 不渲染相对时间：搜索结果的 starred_at 是拿 pushed_at 占位的（见 github.searchRepos），
 * 显示出来会是"最后推送时间"却长得像 Star 时间。
 *
 * Star 成功后**不移除这张卡**，就地翻成"已 Star"——移除会让"到底成没成"无法回答。
 */
export function RecommendRepoCard({ repo }: { repo: Repo }): React.JSX.Element {
  // 选择器返回 boolean，是稳定值；绝不能写成 s => s.repos.some(...) 之外的返回新对象的写法
  const starred = useRepoStore((s) => s.repos.some((r) => r.full_name === repo.full_name))
  const star = useRepoStore((s) => s.star)
  const [busy, setBusy] = useState(false)

  const topics = repo.topics.slice(0, 3)

  async function onStar(): Promise<void> {
    setBusy(true)
    try {
      await star(repo.full_name)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
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
      </div>

      {topics.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex justify-end pt-4">
        {starred ? (
          <span className="inline-flex items-center rounded-lg bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
            已 Star
          </span>
        ) : (
          <Button size="sm" variant="primary" loading={busy} onClick={() => void onStar()}>
            Star 此仓库
          </Button>
        )}
      </div>
    </Card>
  )
}
