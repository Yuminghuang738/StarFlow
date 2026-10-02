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
          {/* scrollbar-gutter:stable 让滚动条**一直占位**。
              各页内容长短差得多（设置页一屏放得下，收藏管理要滚很久），不留位的话
              切板块时整块内容会横向抖一下——滚动条突然出现/消失，内容跟着挪十几像素。
              这是最容易被忽略、但切几个来回就能看出来的廉价感来源。 */}
          <main className="min-w-0 flex-1 overflow-y-auto p-6 [scrollbar-gutter:stable] lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
