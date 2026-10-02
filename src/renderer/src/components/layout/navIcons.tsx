import type { AppTab } from './nav'

/**
 * 导航与页面标题共用的图标集。
 *
 * **刻意内联 SVG、不引图标库**：一共六个图标，为它换一个新依赖不划算；而且这个项目
 * 本来就在 TitleBar / LogoMark 里内联 SVG，再多一套来源只会更乱。
 *
 * 统一规格：24 的 viewBox、描边而非填充、strokeWidth 1.7、圆头圆角。
 * 混用填充与描边会让一排图标看起来粗细不匀——这是图标行最容易露怯的地方。
 *
 * 单独成模块（而不是留在 Sidebar 里）的原因：页面标题的图标徽章要用**同一套**图标。
 * 侧边栏叫「发现仓库」配放大镜，页面标题却是另一个图标，是那种说不上哪里错、
 * 但看着就是不对的细节。同一个 AppTab 在两处取到的必须是同一个图标。
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

export function IconSearch(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  )
}

export function IconChart(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <path d="M4 20v-6M9.3 20V5M14.7 20v-9M20 20V9" />
    </svg>
  )
}

export function IconStar(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <path d="m12 3.6 2.6 5.5 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.9l5.9-.8z" />
    </svg>
  )
}

export function IconSparkle(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <path d="M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5 9.3 11.7 4.5 10l4.8-1.7z" />
      <path d="M18.2 14.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  )
}

export function IconCalendar(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10.2h17" />
    </svg>
  )
}

/**
 * 运行日志：一叠横向短行（列表）＋ 一个光标块。
 * 刻意不用"终端窗口"那种外框——在这个尺寸下外框会吃掉一半的描边细节，
 * 看起来就只是一个方框。
 */
export function IconLog(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <path d="M4 6.5h9M4 11.5h16M4 16.5h11" />
      <path d="M18.6 5.6h1.8" strokeWidth="2.4" />
    </svg>
  )
}

export function IconSettings(): React.JSX.Element {
  return (
    <svg className="h-[18px] w-[18px]" {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3.3" />
      <path d="M12 2.6v2.5M12 18.9v2.5M4.5 4.5 6.3 6.3M17.7 17.7l1.8 1.8M2.6 12h2.5M18.9 12h2.5M4.5 19.5 6.3 17.7M17.7 6.3l1.8-1.8" />
    </svg>
  )
}

export const NAV_ICONS: Record<AppTab, () => React.JSX.Element> = {
  recommend: IconSearch,
  overview: IconChart,
  manage: IconStar,
  similar: IconSparkle,
  report: IconCalendar,
  logs: IconLog,
  settings: IconSettings
}
