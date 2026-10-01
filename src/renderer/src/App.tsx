import { useState } from 'react'
import { AppShell, type AppTab } from './components/layout/AppShell'
import { Dashboard } from './pages/Dashboard'
import { Report } from './pages/Report'
import { Settings } from './pages/Settings'

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
