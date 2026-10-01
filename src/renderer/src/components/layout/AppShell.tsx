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

export function AppShell({ current, onNavigate, children }: AppShellProps): React.JSX.Element {
  return (
    <ToastProvider>
      <div className="flex h-screen w-screen bg-slate-950 text-slate-100">
        <nav className="flex w-52 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-3">
          <div className="px-2 py-3 text-lg font-semibold tracking-tight">StarPilot</div>
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
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </ToastProvider>
  )
}
