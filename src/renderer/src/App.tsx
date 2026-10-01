import { useEffect, useState } from 'react'
import { AppShell, type AppTab } from './components/layout/AppShell'
import { Dashboard } from './pages/Dashboard'
import { Report } from './pages/Report'
import { Settings } from './pages/Settings'

const PAGES: { key: AppTab; render: () => React.JSX.Element }[] = [
  { key: 'dashboard', render: () => <Dashboard /> },
  { key: 'report', render: () => <Report /> },
  { key: 'settings', render: () => <Settings /> }
]

/**
 * 入口：用 useState 管理 tab，不引 react-router。
 * 注意：
 * - 不要再包一层 <ToastProvider>，它已经在 AppShell 内部了。
 * - 挂载加载保留 Dashboard 里的 load()（P5 负责），这里不重复请求。
 *
 * ⚠️ **页面是"保活"的：首次访问之后不再卸载，切走只是 display:none。**
 * 之前是条件渲染（`tab === 'report' ? <Report/> : null`），切一次 tab 就整个重挂，
 * 代价是两条真实的用户可见 bug：
 *   - 周报页的 report / loading / error 都是本地 state，切走就没了；生成到一半切走更糟——
 *     await 回来时组件已经不在，跑了半天的结果直接丢掉。
 *   - 克隆进行中切走，RepoActions 的 pendingAction 跟着重置，「克隆中」和进度条一起消失。
 *     （克隆本身在主进程里跑，不受影响，丢的只是界面上的状态。）
 *
 * 三个注意点：
 *   1. **首次访问才挂载**（visited）。一开始就把三页全挂上，Report / Settings 的
 *      effect 会在启动时白跑一遍（拉 token 状态等），而且 echarts 会在 0×0 的容器里初始化。
 *   2. **渲染用的是派生值 mounted，不是 visited 本身**。如果把"记下新 tab"只交给 effect，
 *      新页面会先渲染一帧空、effect 跑完才出现，肉眼能看见闪一下。
 *   3. **不引 React 的 <Activity>**：它的 hidden 模式会清掉副作用，正好会掐断
 *      CloneProgressBar 的轮询——那正是这个改动要保住的东西。
 *
 * display:none 不会让图表画成空白：echarts-for-react 用 size-sensor 监听容器，
 * 本机 Chromium 有 ResizeObserver，从 0×0 变回正常尺寸时会自动 resize()。
 */
export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<AppTab>('dashboard')
  // 已经挂载过的页面。dashboard 是首屏，一开始就在
  const [visited, setVisited] = useState<readonly AppTab[]>(['dashboard'])

  // 派生值：当前 tab 一定算已挂载。用 visited 直接渲染的话，新 tab 的首帧会是空的
  const mounted = visited.includes(tab) ? visited : [...visited, tab]

  useEffect(() => {
    setVisited((prev) => (prev.includes(tab) ? prev : [...prev, tab]))
  }, [tab])

  return (
    <AppShell current={tab} onNavigate={setTab}>
      {PAGES.map((page) =>
        mounted.includes(page.key) ? (
          // 这一层 div 只为承载 hidden：它在激活时没有任何类，对布局完全透明，
          // 页面各自的 mx-auto / max-w-* 照常生效
          <div key={page.key} className={page.key === tab ? undefined : 'hidden'}>
            {page.render()}
          </div>
        ) : null
      )}
    </AppShell>
  )
}
