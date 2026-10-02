import { motion, type Transition } from 'framer-motion'
import { cn } from '../../lib/cn'
import { NAV_ITEMS, type AppTab } from './nav'
import { NAV_ICONS } from './navIcons'
import { AccountPanel } from './AccountPanel'

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

      {/* 底部原来写死的是「v0.1.0 / Hackathon Build」——一行没人会看的静态信息，
          占了侧边栏唯一一块"常驻、且属于你"的位置。换成账号块：头像 + 昵称，
          点开就能登录 / 退出（见 AccountPanel.tsx）。 */}
      <div className="mt-auto px-2 pt-3">
        <AccountPanel />
      </div>
    </nav>
  )
}

