import { ToastProvider } from '../common/Toast'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import type { AppTab } from './nav'

export type { AppTab } from './nav'

export interface AppShellProps {
  current: AppTab
  onNavigate(tab: AppTab): void
  children: React.ReactNode
}

/**
 * 应用外壳：自绘标题栏 + 左侧固定侧边栏 + 可滚动内容区。
 * ToastProvider 已经包在这里（App.tsx 不要再包一层，否则会渲染两个 toast 容器）。
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
          <Sidebar current={current} onNavigate={onNavigate} />
          <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  )
}
