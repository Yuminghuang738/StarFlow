import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { NAV_ICONS } from './navIcons'
import type { AppTab } from './nav'

/**
 * 页面级布局的两个积木：PageContainer（宽度与纵向节奏）+ PageHeader（标题区）。
 *
 * 抽出来的直接原因是各页的这三件事此前是各写各的：
 *   · 内容宽度 6xl / 4xl / 2xl 三种，谁也说不清某个页面为什么是这个值；
 *   · 标题有的 text-xl 有的带副标题有的不带，间距 1 和 1.5 混着用；
 *   · 右侧操作区有的 items-center 有的 items-end，加个按钮就换一次对齐方式。
 * 换一个页面就看得出「拼装感」，而这类细节恰恰是界面显得业余的主要来源。
 */

const WIDTHS = {
  /** 列表与图表页：要横向空间多排几列 */
  wide: 'max-w-6xl',
  /** 以阅读为主：正文段落太长会看串行 */
  medium: 'max-w-4xl',
  /** 表单页：太宽的话标签与输入框离得太远，填起来费眼 */
  narrow: 'max-w-2xl'
} as const

export interface PageContainerProps {
  width?: keyof typeof WIDTHS
  className?: string
  children: ReactNode
}

export function PageContainer({
  width = 'wide',
  className,
  children
}: PageContainerProps): React.JSX.Element {
  return (
    <div className={cn('mx-auto flex w-full flex-col gap-5', WIDTHS[width], className)}>
      {children}
    </div>
  )
}

export interface PageHeaderProps {
  /** 用哪个板块的图标。与侧边栏取同一套（navIcons），两处图标必须一致 */
  tab: AppTab
  title: string
  subtitle?: ReactNode
  /** 贴在标题右侧的附属内容，例如收藏管理的「12 / 40」计数徽章 */
  suffix?: ReactNode
  /** 右对齐的操作区 */
  actions?: ReactNode
}

export function PageHeader({
  tab,
  title,
  subtitle,
  suffix,
  actions
}: PageHeaderProps): React.JSX.Element {
  const Icon = NAV_ICONS[tab]
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-start gap-3">
        {/* 图标徽章：让「当前在哪个板块」在标题处再确认一次，也让各页有个统一的视觉锚点。
            bg-primary/10 是 token 的透明度用法，两套主题都成立，不要换成写死的色值。 */}
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-primary/10 text-primary"
          aria-hidden
        >
          <Icon />
        </span>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {title}
            {suffix}
          </h1>
          {subtitle === undefined || subtitle === null ? null : (
            <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {actions === undefined || actions === null ? null : (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  )
}
