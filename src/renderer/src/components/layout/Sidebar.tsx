import { motion, type Transition } from 'framer-motion'
import { cn } from '../../lib/cn'
import { NAV_ITEMS, type AppTab } from './nav'

/**
 * 左侧导航。
 *
 * 选中态用一个 `layoutId` 共享的 motion.span 做滑动 pill——侧边栏是**常驻**的，
 * 所以 layout 动画在这里是安全的（页面级切换动效不安全，见 App.tsx 的说明）。
 *
 * 玻璃效果（半透明 + backdrop-blur）只用在侧边栏、标题栏这类**结构性**表面上。
 * 仓库列表、周报数据区那种信息密集的地方不能用，文字对比度和滚动性能都会崩。
 */

const PILL_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 40,
  mass: 0.7
}

/**
 * 导航图标。**刻意内联 SVG、不引图标库**：六个图标换一个新依赖不划算，
 * 而且这个项目本来就在 TitleBar / LogoMark 里内联 SVG，多一套来源只会更乱。
 *
 * 统一规格：24 的 viewBox、描边而非填充、strokeWidth 1.7、圆头圆角。
 * 混用填充与描边会让一排图标看起来粗细不匀——这是图标行最容易露怯的地方。
 *
 * 为什么不放进 nav.ts：那是 .ts，写不了 JSX。把图标塞成字符串再动态解析
 * 更是本末倒置，所以直接在这里按 AppTab 建映射，nav.ts 保持纯数据。
 */
const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
} as const

function IconSearch(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  )
}

function IconChart(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <path d="M4 20v-6M9.3 20V5M14.7 20v-9M20 20V9" />
    </svg>
  )
}

function IconStar(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <path d="m12 3.6 2.6 5.5 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.9l5.9-.8z" />
    </svg>
  )
}

function IconSparkle(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <path d="M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5 9.3 11.7 4.5 10l4.8-1.7z" />
      <path d="M18.2 14.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  )
}

function IconCalendar(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10.2h17" />
    </svg>
  )
}

function IconSettings(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3.3" />
      <path d="M12 2.6v2.5M12 18.9v2.5M4.5 4.5 6.3 6.3M17.7 17.7l1.8 1.8M2.6 12h2.5M18.9 12h2.5M4.5 19.5 6.3 17.7M17.7 6.3l1.8-1.8" />
    </svg>
  )
}

const NAV_ICONS: Record<AppTab, () => React.JSX.Element> = {
  recommend: IconSearch,
  overview: IconChart,
  manage: IconStar,
  similar: IconSparkle,
  report: IconCalendar,
  settings: IconSettings
}

function LogoMark(): React.JSX.Element {
  // 内联 SVG 纸飞机
  return (
    <svg className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  )
}

export function Sidebar({
  current,
  onNavigate
}: {
  current: AppTab
  onNavigate(tab: AppTab): void
}): React.JSX.Element {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-surface/60 p-3 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-2 py-3">
        <LogoMark />
        <span className="text-lg font-semibold tracking-tight">StarFlow</span>
      </div>

      {/* 分组标题。六个入口平铺时全是同级文字，看不出这是一组导航；
          加一行小标题之后视觉上有了「结构」，也让上方 Logo 区与功能区分开。 */}
      <div className="mt-3 px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        导航
      </div>

      <div className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.key === current
          const Icon = NAV_ICONS[item.key]
          return (
            <button
              key={item.key}
              type="button"
              title={item.hint}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.key)}
              className={cn(
                'relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                active ? 'font-medium text-solid-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              )}
            >
              {active ? (
                <motion.span
                  layoutId="nav-active"
                  transition={PILL_TRANSITION}
                  className="absolute inset-0 rounded-xl bg-primary-solid shadow-sm"
                  aria-hidden
                />
              ) : null}
              {/* 相对定位把图标与文字抬到 pill 之上；pill 是 absolute 的，不占布局。
                  图标用 currentColor，颜色跟着按钮的选中/悬停态走，不需要单独判一次 active。 */}
              <span className="relative flex shrink-0 items-center">
                <Icon />
              </span>
              <span className="relative truncate">{item.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-auto px-2 pt-3">
        <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2">
          <div className="text-xs font-medium text-fg-muted">v0.1.0</div>
          <div className="text-[11px] text-fg-subtle">Hackathon Build</div>
        </div>
      </div>
    </nav>
  )
}

