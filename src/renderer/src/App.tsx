import { useState } from 'react'
import { AppShell, type AppTab } from './components/layout/AppShell'
import { Dashboard } from './pages/Dashboard'
import { Report } from './pages/Report'
import { Settings } from './pages/Settings'

/**
 * 入口：用 useState 管理 tab，条件渲染三个页面，不引 react-router。
 * 注意：
 * - 不要再包一层 <ToastProvider>，它已经在 AppShell 内部了。
 * - 挂载加载保留 Dashboard 里的 load()（P5 负责），这里不重复请求。
 * - 三个页面是条件渲染、切走即卸载，store 里的筛选条件留得住，滚动位置/未提交输入会丢。
 */
export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<AppTab>('dashboard')

  return (
    <AppShell current={tab} onNavigate={setTab}>
      {tab === 'dashboard' ? <Dashboard /> : null}
      {tab === 'report' ? <Report /> : null}
      {tab === 'settings' ? <Settings /> : null}
    </AppShell>
  )
}
