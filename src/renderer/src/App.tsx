import { useEffect, useRef, useState } from 'react'
import { MotionConfig, motion, type Transition } from 'framer-motion'
import { AppShell } from './components/layout/AppShell'
import { useRepoStore } from './store/repoStore'
import type { AppTab } from './components/layout/nav'
import { Overview } from './pages/Overview'
import { Manage } from './pages/Manage'
import { Discover } from './pages/Discover'
import { Similar } from './pages/Similar'
import { Report } from './pages/Report'
import { Settings } from './pages/Settings'

const PAGES: { key: AppTab; render: () => React.JSX.Element }[] = [
  { key: 'recommend', render: () => <Discover /> },
  { key: 'overview', render: () => <Overview /> },
  { key: 'manage', render: () => <Manage /> },
  { key: 'similar', render: () => <Similar /> },
  { key: 'report', render: () => <Report /> },
  { key: 'settings', render: () => <Settings /> }
]

/** 首屏板块。选总览而不是推荐：没配 token 时推荐页是个死胡同，总览永远有东西看。 */
const DEFAULT_TAB: AppTab = 'overview'

/**
 * 板块切换的入场动效：淡入 + 轻微上移。
 *
 * **不能用 AnimatePresence 做页面切换**（这是本项目的一条硬约束）：页面是保活的，
 * 切走只是 display:none、不卸载，没有卸载就没有 exit，AnimatePresence 也就无从播起。
 * 这里改用同一个 motion.div 的两种 animate 目标值：非激活态挂在 opacity:0 / y:6 上
 * （反正被 display:none 挡着，看不见），一旦变成激活态，framer 会从这组值动画到
 * 1 / 0——入场观感与 AnimatePresence 一样，但组件在动画前后始终是同一个，
 * 页面里的 report / 克隆进度 / 搜索框一个字都不会丢。这正是保活要保住的东西。
 *
 * 非激活态给 duration: 0：切走时不必再跑一遍淡出（display:none 立刻生效，根本看不见），
 * 不给 0 的话六个页面会在后台各空转 0.24 秒。
 */
const PAGE_ENTER: Transition = { duration: 0.24, ease: 'easeOut' }
const PAGE_IDLE: Transition = { duration: 0 }

/**
 * 入口：用 useState 管理 tab，不引 react-router。
 * 注意不要再包一层 <ToastProvider>，它已经在 AppShell 内部了。
 *
 * ⚠️ **页面是"保活"的：首次访问之后不再卸载，切走只是 display:none。**
 * 之前是条件渲染（`tab === 'report' ? <Report/> : null`），切一次 tab 就整个重挂，
 * 代价是两条真实的用户可见 bug：
 *   - 周报页的 report / loading / error 都是本地 state，切走就没了；生成到一半切走更糟——
 *     await 回来时组件已经不在，跑了半天的结果直接丢掉。
 *   - 克隆进行中切走，RepoActions 的 pendingAction 跟着重置，「克隆中」和进度条一起消失。
 *     （克隆本身在主进程里跑，不受影响，丢的只是界面上的状态。）
 *
 * 四个注意点：
 *   1. **首次访问才挂载**（visited）。一开始就把六页全挂上，Report / Settings / 推荐页的
 *      effect 会在启动时白跑一遍（拉 token 状态等），而且 echarts 会在 0×0 的容器里初始化。
 *   2. **渲染用的是派生值 mounted，不是 visited 本身**。如果把"记下新 tab"只交给 effect，
 *      新页面会先渲染一帧空、effect 跑完才出现，肉眼能看见闪一下。
 *   3. **不引 React 的 <Activity>**：它的 hidden 模式会清掉副作用，正好会掐断
 *      CloneProgressBar 的轮询——那正是这个改动要保住的东西。
 *   4. **初始加载必须在这里跑，不能下放到页面里。** 原来它挂在 Dashboard 内部；
 *      Dashboard 拆成 Overview（统计+图表）+ Manage（筛选+列表）之后，两边都会调
 *      `load()`，那就是双重拉取 + 双重对账 IPC（store.load() 末尾折着 pruneLocalClones）。
 *      loadedOnce 的 ref 是防重复挂载的第二道闸——StrictMode 下 effect 会跑两遍。
 *
 * display:none 不会让图表画成空白：echarts-for-react 用 size-sensor 监听容器，
 * 本机 Chromium 有 ResizeObserver，从 0×0 变回正常尺寸时会自动 resize()。
 */
export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<AppTab>(DEFAULT_TAB)
  // 已经挂载过的页面。默认页是首屏，一开始就在
  const [visited, setVisited] = useState<readonly AppTab[]>([DEFAULT_TAB])

  const load = useRepoStore((s) => s.load)

  const loadedOnce = useRef(false)
  useEffect(() => {
    if (loadedOnce.current) return
    loadedOnce.current = true
    void load()
  }, [load])

  // 派生值：当前 tab 一定算已挂载。用 visited 直接渲染的话，新 tab 的首帧会是空的
  const mounted = visited.includes(tab) ? visited : [...visited, tab]

  useEffect(() => {
    setVisited((prev) => (prev.includes(tab) ? prev : [...prev, tab]))
  }, [tab])

  return (
    // reducedMotion="user"：用户在系统里开了「减少动态效果」时，framer 会自动跳过
    // 位移 / 缩放这类动画（透明度保留）。只靠 CSS 的 prefers-reduced-motion 拦不住
    // framer——它走的是 JS 驱动的动画，不过 CSS transition，两处都要管。
    <MotionConfig reducedMotion="user">
      <AppShell current={tab} onNavigate={setTab}>
        {PAGES.map((page) => {
          if (!mounted.includes(page.key)) return null
          const active = page.key === tab
          return (
            // 这一层 div 承载 hidden 与切换动效：非激活时加 hidden，激活时不加任何类，
            // 对布局完全透明，页面各自的 mx-auto / max-w-* 照常生效。
            <motion.div
              key={page.key}
              className={active ? undefined : 'hidden'}
              // initial={false}：首屏那一次不要播动画，否则启动时整页会淡入一下
              initial={false}
              animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={active ? PAGE_ENTER : PAGE_IDLE}
            >
              {page.render()}
            </motion.div>
          )
        })}
      </AppShell>
    </MotionConfig>
  )
}
