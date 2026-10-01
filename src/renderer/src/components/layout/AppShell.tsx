import { ToastProvider } from '../common/Toast'

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
    <svg className="h-6 w-6 text-sky-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  )
}

/**
 * 应用外壳：左侧固定侧边栏 + 可滚动内容区。
 * ToastProvider 已经包在这里（App.tsx 不要再包一层，否则会渲染两个 toast 容器）。
 * 主色是 sky（bg-sky-600），不是 indigo。
 */
export function AppShell({ current, onNavigate, children }: AppShellProps): React.JSX.Element {
  return (
    <ToastProvider>
      <div className="flex h-screen w-screen bg-slate-950 text-slate-100">
        <nav className="flex w-52 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center gap-2 px-2 py-3">
            <LogoMark />
            <span className="text-lg font-semibold tracking-tight">StarPilot</span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onNavigate(t.key)}
                className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  current === t.key
                    ? 'bg-sky-600 font-medium text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-auto border-t border-slate-800 px-2 pt-3">
            <div className="text-xs font-medium text-slate-300">v0.1.0</div>
            <div className="text-[11px] text-slate-500">Hackathon Build</div>
          </div>
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </ToastProvider>
  )
}
