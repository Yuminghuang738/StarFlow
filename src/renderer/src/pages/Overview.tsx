import { useMemo } from 'react'
import { useRepoStore } from '../store/repoStore'
import { Card } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { LanguagePie } from '../components/charts/LanguagePie'
import { StarTrendChart } from '../components/charts/StarTrendChart'
import { formatStars, languageColor } from '../components/repo/repoFormat'
import { computeCollectionStats, isRealCategory, type CollectionStats } from '../lib/collectionStats'
import { cn } from '../lib/cn'
import type { Repo } from '@shared/types'

/**
 * 收藏总览：统计卡片 + 分布条形图 + 图表 + 亮点。
 *
 * 全部数字来自 lib/collectionStats.ts 的纯函数（同输入同输出、时间口径统一为 UTC 日历天），
 * 页面只负责渲染——这里**不**做计算，也**不**调 load()：初始加载已经提到 App.tsx 里
 * 全局跑一次了，总览和管理页各留一份就是双重拉取 + 双重 prune IPC。
 *
 * ⚠️ 「本周新增」与图表、周报页共用同一套 UTC 口径，改这里之前先看 report.ts。
 */
export function Overview(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)

  const stats = useMemo(() => computeCollectionStats(repos, Date.now()), [repos])

  if (repos.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <PageHeader stats={stats} />
        <EmptyState
          title="还没有同步过 Star"
          description="到「设置」页配好 GitHub Token，再到「收藏管理」点一次同步，这里就会长出图表"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader stats={stats} />

      {/* 统计卡片：8 项。信息量对比只有 4 项时翻了一倍，且每项都补了一句参照文案 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="仓库总数" value={stats.total} hint={`总星标 ${formatStars(stats.totalStars)}`} />
        <StatCard
          label="本周新增"
          value={stats.recent7}
          hint={trendHint(stats.recent7, stats.prev7)}
          tone={stats.recent7 > 0 ? 'up' : 'flat'}
        />
        <StatCard
          label="AI 已分类"
          value={stats.categorized}
          hint={`${percent(stats.categorized, stats.total)}，${stats.uncategorized} 个待补全`}
        />
        <StatCard label="语言数" value={stats.languageCount} hint={`平均 ${formatStars(stats.avgStars)} 星`} />
        <StatCard label="已 Clone" value={stats.cloned} hint={`Fork 过 ${stats.forked} 个`} />
        <StatCard
          label="近期活跃"
          value={stats.activeRecently}
          hint="90 天内有过提交"
          tone={stats.activeRecently > 0 ? 'up' : 'flat'}
        />
        <StatCard label="主题标签" value={stats.topicCount} hint="去重后的 topic 数" />
        <StatCard
          label="可能已停更"
          value={stats.stale}
          hint={stats.unknownPush > 0 ? `另有 ${stats.unknownPush} 个拿不到提交时间` : '超过一年没有提交'}
          tone={stats.stale > stats.total / 3 ? 'warn' : 'flat'}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="语言分布" subtitle={`Top ${stats.topLanguages.length}，按仓库数`} />
          <div className="mt-3 space-y-2.5">
            {stats.topLanguages.map((b) => (
              <BarRow
                key={b.name}
                name={b.name}
                count={b.count}
                ratio={b.ratio}
                color={languageColor(b.name)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle title="AI 分类分布" subtitle="7 个固定分类各占多少" />
          <div className="mt-3 space-y-2">
            {stats.categories.map((b) => (
              <BarRow
                key={b.name}
                name={b.name}
                count={b.count}
                ratio={b.ratio}
                // 未分类用中性灰：它不是一个分类，别让它抢走分类色的注意力
                color={isRealCategory(b.name) ? categoryColor(b.name) : undefined}
                muted={!isRealCategory(b.name)}
                compact
              />
            ))}
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LanguagePie />
        <StarTrendChart />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="高频主题" subtitle={`全部 ${stats.topicCount} 个标签里出现最多的`} />
          {stats.topTopics.length === 0 ? (
            <p className="mt-3 text-sm text-fg-subtle">这批仓库都没有 topic 标签。</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {stats.topTopics.map((t) => (
                <span
                  key={t.name}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg-muted"
                >
                  {t.name}
                  <span className="tabular-nums text-fg-subtle">{t.count}</span>
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="最热收藏" subtitle="你 Star 过的仓库里星标最多的" />
          {stats.topRepo === null ? (
            <p className="mt-3 text-sm text-fg-subtle">还没有数据。</p>
          ) : (
            <TopRepoCard repo={stats.topRepo} />
          )}
        </Card>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 局部组件                                                            */
/* ------------------------------------------------------------------ */

function PageHeader({ stats }: { stats: CollectionStats }): React.JSX.Element {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5">
      {/* 这一层渐变光斑是整页唯一的装饰性用色，压得很淡：太浓会和图表抢注意力 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent opacity-[0.14] blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">收藏总览</h1>
          <p className="mt-1 text-sm text-fg-muted">
            你已经收藏了 <span className="font-medium text-primary">{stats.total}</span> 个仓库
            {stats.totalStars > 0 ? (
              <>
                ，一共 <span className="font-medium text-fg">{formatStars(stats.totalStars)}</span> 颗星
              </>
            ) : null}
          </p>
        </div>
        {stats.uncategorized > 0 ? (
          <p className="text-xs text-fg-subtle">
            还有 {stats.uncategorized} 个未分类，可到「收藏管理」跑一次 AI 补全
          </p>
        ) : null}
      </div>
    </section>
  )
}

function TopRepoCard({ repo }: { repo: Repo }): React.JSX.Element {
  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 block rounded-lg border border-border bg-surface-2/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="truncate text-sm font-medium text-fg">{repo.full_name}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
        <span className="font-medium text-primary">★ {formatStars(repo.stargazers_count)}</span>
        {repo.language === null ? null : (
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: languageColor(repo.language) }}
              aria-hidden
            />
            {repo.language}
          </span>
        )}
      </div>
      {repo.description === null ? null : (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-subtle">
          {repo.description}
        </p>
      )}
    </a>
  )
}

function StatCard({
  label,
  value,
  hint,
  tone = 'flat'
}: {
  label: string
  value: number
  hint?: string
  tone?: 'up' | 'warn' | 'flat'
}): React.JSX.Element {
  return (
    <Card className="min-w-0 transition-transform duration-200 hover:-translate-y-0.5">
      <div
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'up' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-fg'
        )}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-fg-muted">{label}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-fg-subtle">{hint}</div> : null}
    </Card>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-medium text-fg">{title}</h2>
      <span className="text-[11px] text-fg-subtle">{subtitle}</span>
    </div>
  )
}

function BarRow({
  name,
  count,
  ratio,
  color,
  muted = false,
  compact = false
}: {
  name: string
  count: number
  ratio: number
  color?: string
  muted?: boolean
  compact?: boolean
}): React.JSX.Element {
  const width = `${Math.round(ratio * 100)}%`
  return (
    <div className={cn('flex items-center gap-2', compact ? 'text-xs' : 'text-sm')}>
      <span className={cn('w-24 shrink-0 truncate', muted ? 'text-fg-subtle' : 'text-fg-muted')}>
        {name}
      </span>
      {/* 条底始终画出来，0 值也能看出「这一栏是空的」而不是渲染坏了 */}
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width, background: color ?? '#64748b' }}
        />
      </span>
      <span className="w-8 shrink-0 text-right tabular-nums text-fg-muted">{count}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 文案小工具                                                          */
/* ------------------------------------------------------------------ */

function percent(part: number, whole: number): string {
  if (whole <= 0) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

/** 本周与上周的对比文案；上周为 0 时不显示「+∞%」那种废话 */
function trendHint(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '上周还没有新增' : '上周也没有新增'
  const diff = current - previous
  if (diff === 0) return '与上周持平'
  const pct = Math.round((Math.abs(diff) / previous) * 100)
  return diff > 0 ? `比上周多 ${pct}%` : `比上周少 ${pct}%`
}

/**
 * 7 个分类的固定色。取的是「语义大体对得上」的一组（AI 偏紫、前端偏青、后端偏蓝…），
 * 与图表里的调色板无关——这张表只用来给条形着色，稳定比好看重要。
 */
const CATEGORY_COLORS: Record<string, string> = {
  'AI/ML': '#a78bfa',
  前端: '#22d3ee',
  后端: '#60a5fa',
  DevOps: '#fbbf24',
  工具: '#94a3b8',
  学习资源: '#4ade80',
  其他: '#64748b'
}

function categoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? '#64748b'
}
