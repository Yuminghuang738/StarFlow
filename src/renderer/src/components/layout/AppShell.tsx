import { cn } from '../../lib/cn'
import { ToastProvider } from '../common/Toast'
import { TitleBar } from './TitleBar'

export type AppTab = 'dashboard' | 'report' | 'settings'

export interface AppShellProps {
  current: AppTab
  onNavigate(tab: AppTab): void
  children: React.ReactNode
}

const TABS: { key: AppTab; label: string }[] = [
  { key: 'dashboard', label: 'Star 管理' },
  { key: 'report', label: '周报' },
  { key: 'settings', label: '设置' }
]

function LogoMark(): React.JSX.Element {
  // 内联 SVG 纸飞机
  return (
    <svg className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  )
}

/**
 * 应用外壳：自绘标题栏 + 左侧固定侧边栏 + 可滚动内容区。
 * ToastProvider 已经包在这里（App.tsx 不要再包一层，否则会渲染两个 toast 容器）。
 * 主色走 primary token（indigo 系），两套主题各给一个值。
 *
 * 最外层是 flex-col、标题栏占固定高度：主进程那边 BrowserWindow 是 frame:false，
 * 原生标题栏已经没了，高度必须由这里自己让出来。中段要 min-h-0，否则内容撑高时
 * 内层的 overflow-y-auto 会因为 flex 的默认 min-height:auto 而滚不动。
 */
export function AppShell({ current, onNavigate, children }: AppShellProps): React.JSX.Element {
  return (
    <ToastProvider>
      <div className="flex h-screen w-screen flex-col text-fg">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-52 shrink-0 flex-col border-r border-border bg-surface/60 p-3">
            <div className="flex items-center gap-2 px-2 py-3">
              <LogoMark />
              <span className="text-lg font-semibold tracking-tight">StarFlow</span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onNavigate(t.key)}
                  className={cn(
                    'rounded-md px-3 py-2 text-left text-sm transition-colors',
                    // 选中态是实心底，所以走 -solid 那组 token：--c-primary 是当文字用的，
                    // 暗色下偏亮，配白字对比度不够（见 index.css 的说明）。
                    current === t.key
                      ? 'bg-primary-solid font-medium text-solid-fg'
                      : 'text-fg-muted hover:bg-surface-2'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-auto border-t border-border px-2 pt-3">
              <div className="text-xs font-medium text-fg-muted">v0.1.0</div>
              <div className="text-[11px] text-fg-subtle">Hackathon Build</div>
            </div>
          </nav>
          <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}
