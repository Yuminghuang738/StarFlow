import type { Repo } from '@shared/types'
import { RepoActions } from './RepoActions'
import { RepoExplain } from './RepoExplain'
import { formatRelative, formatStars, languageColor } from './repoFormat'

/**
 * 单个仓库的**横条**（GitHub 仓库列表那种一行一个的样子）。
 *
 * 为什么从卡片换成横条：卡片是网格布局，真正的信息只有「名字 / 描述 / 语言 / 星标」
 * 四项，却被摊成三列宽的一整块，一屏只放得下 6 个；而收藏动辄几百个，
 * 用户要的是**扫**过去，不是一个个翻。横条把同样的信息压到一行里，
 * 一屏能看十几个，横向的留白还给描述，长描述反而比卡片里显示得更完整。
 *
 * 外层不套 Card：分隔线由 RepoList 的容器统一画（border-b + last:border-b-0），
 * 一行一条线才是列表；每条自带边框会变回一堆卡片。
 */
export function RepoRow({ repo }: { repo: Repo }): React.JSX.Element {
  const topics = repo.topics.slice(0, 4)
  const category = repo.ai_category

  return (
    <div className="group flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-2/50">
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {/* 悬停只加下划线、不改颜色：暗色主题下没有「更亮」的语义 token，
              写 /90 反而会让它变淡。 */}
          <a
            href={repo.html_url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 truncate font-medium text-link underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            title={repo.full_name}
          >
            {repo.full_name}
          </a>

          {category ? (
            <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
              {category}
            </span>
          ) : (
            <span className="shrink-0 rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
              未分类
            </span>
          )}
        </div>

        {repo.description === null ? (
          <p className="mt-1 line-clamp-1 text-sm italic text-fg-subtle">暂无描述</p>
        ) : (
          // 横条的宽度给了描述，这里比卡片里多留一行——长描述扫一眼就够，
          // 真要细看会点进 GitHub
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg-muted">
            {repo.description}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
              style={{ backgroundColor: languageColor(repo.language) }}
              aria-hidden="true"
            />
            {repo.language ?? '未知语言'}
          </span>

          <span className="tabular-nums">★ {formatStars(repo.stargazers_count)}</span>

          <span title={repo.starred_at}>{formatRelative(repo.starred_at)} Star</span>

          {topics.map((t) => (
            <span
              key={t}
              className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted"
            >
              {t}
            </span>
          ))}
        </div>

        {/* 一句话解释：默认收起，点一次才请求 */}
        <RepoExplain repo={repo} />
      </div>

      {/* 操作区固定在最右，不随左边内容宽度浮动——竖着一列扫下来位置一致，
          才好在同一个位置连点。窄屏放不下时整块折到下面（flex-wrap 在外层行上）。 */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        <RepoActions repo={repo} />
      </div>
    </div>
  )
}
