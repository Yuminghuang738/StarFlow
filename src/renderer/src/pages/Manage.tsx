import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepoStore } from '../store/repoStore'
import { useNav } from '../components/layout/NavContext'
import { DEFAULT_FILTERS, selectRepos } from '../lib/repoQuery'
import { enrichButtonLabel } from '../lib/enrichLabel'
import { Button } from '../components/common/Button'
import { FilterBar } from '../components/repo/FilterBar'
import { RepoList } from '../components/repo/RepoList'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'

/**
 * 自动检查的节流窗口。来回切 tab（看一眼总览再切回来）不该每次都打一整批
 * `git fetch`——那是对网络的实打实的浪费，还可能撞上远端限流。
 * 手动「检查更新」按钮**不受**这个窗口限制：用户明确要求就是明确要求。
 */
const AUTO_CHECK_MIN_MS = 20_000

/**
 * 收藏管理：筛选 + 列表 + 批量操作（同步 / AI 补全 / 本地副本检查与更新）。
 *
 * ⚠️ 这里**不**调 `load()`，初始加载统一在 App.tsx 里跑一次（原因见 Overview 顶部注释）。
 * 同步 / 补全按钮本身不涉及初始加载，留在本页是对的——它们是明确的用户动作。
 * 本地副本的自动检查同理：它是"进页面顺手刷新一下"，不是首屏加载的一部分。
 */
export function Manage(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const filters = useRepoStore((s) => s.filters)
  const loading = useRepoStore((s) => s.loading)
  const refreshFromGitHub = useRepoStore((s) => s.refreshFromGitHub)
  const enrich = useRepoStore((s) => s.enrich)
  // 补全进度：订阅这个字段本身（null 或主进程给的那份快照，引用稳定）。
  // 不要写成 `(s) => ({ done: ..., total: ... })`——每次都是新对象，zustand v5 会无限重渲染。
  const enrichProgress = useRepoStore((s) => s.enrichProgress)
  const checkAllLocalSync = useRepoStore((s) => s.checkAllLocalSync)
  const updateAllLocal = useRepoStore((s) => s.updateAllLocal)
  const syncingAll = useRepoStore((s) => s.syncingAll)
  const updatingAll = useRepoStore((s) => s.updatingAll)
  const syncByRepo = useRepoStore((s) => s.syncByRepo)
  const { current } = useNav()

  // 注意不要写成 useRepoStore((s) => s.visibleRepos())：visibleRepos() 每次返回新数组，
  // zustand v5 的 useSyncExternalStore 用严格相等比较快照，会判定值一直在变而无限重渲染。
  // 正确做法是订阅它依赖的两个切片，再用同一个纯函数算（filters 因此是真实的依赖）。
  //
  // now 在 useMemo 里取：活跃度筛选（90 / 365 天）要一个"此刻"，但把 Date.now() 放进
  // 依赖数组等于每次渲染都重算，memo 就白写了。放在这里意味着它是"这一版 repos/filters
  // 算出结果的那个时刻"，对按天计的阈值来说完全够用。
  const visible = useMemo(() => selectRepos(repos, filters, Date.now()), [repos, filters])

  /** 有本地副本的仓库数——「更新全部」没有对象时就该禁用，而不是点了弹一句"没有可更新的" */
  const clonedCount = useMemo(
    () => repos.filter((r) => r.local?.cloned_path).length,
    [repos]
  )

  /**
   * 页头那个「· 落后 N」。
   *
   * 两个刻意的选择：
   *   ① 只数**当前仍有 cloned_path** 的仓库——副本被删掉之后 syncByRepo 里那条结果
   *      不会自动消失（它只是内存态），照着 record 数会数出一个早已不存在的仓库。
   *   ② 只在 N > 0 时显示。未知（没查过）不算落后，也不显示"落后 0"占位——
   *      「未检查」与「已是最新」的区别由每行的徽章负责说清，页头不重复表态。
   */
  const behindCount = useMemo(
    () =>
      repos.filter((r) => {
        if (!r.local?.cloned_path) return false
        const s = syncByRepo[r.full_name]
        return s !== undefined && s.behind !== null && s.behind > 0
      }).length,
    [repos, syncByRepo]
  )

  // 两个按钮各自维护忙碌态。
  // 不能直接用 store 的 loading 决定文案：loading 是全局的，点「同步」时
  // 「AI 补全分类」也会被算成 busy 而显示成"补全中…"，两个按钮的文案会错配。
  // （检查/更新这两个用 store 的 syncingAll / updatingAll 就够——它们是全局唯一的批次，
  // 不存在"别人的忙碌把我的文案顶掉"的问题。）
  const [syncBusy, setSyncBusy] = useState(false)
  const [enrichBusy, setEnrichBusy] = useState(false)
  // 任一在跑就都禁用，避免两个操作并发（store 的 loading 也会兜住 UI 状态）
  const headerBusy = loading || syncBusy || enrichBusy || syncingAll || updatingAll

  /**
   * 「进入收藏管理页」自动检查一次；「离开」时清空筛选器。
   *
   * 页面是保活的（切走只是 display:none、不卸载），组件自己察觉不到"我又被看见了"，
   * 所以要靠 NavContext 的 current 做**进入沿/离开沿**判定：进入沿只有 false → true
   * 那一刻触发（而不是 current === 'manage' 就触发，那样每次渲染都会重新开一批 fetch）；
   * 离开沿只有 true → false 那一刻触发，用来清筛选（见下方说明）。
   * ref 同时挡住 StrictMode 的双跑。
   *
   * 依赖数组只有 current：effect 里要读的 syncCheckedAt / syncingAll 都是**即时取值**
   * （useRepoStore.getState()），不订阅——订阅会让这批值一变化就重跑 effect，
   * 而重跑只为再判一次"是不是刚进来"，得不偿失。节流窗口因此也不会被这批值的变化重置。
   */
  const wasOnManageRef = useRef(false)
  useEffect(() => {
    const onManage = current === 'manage'
    const justEntered = onManage && !wasOnManageRef.current
    const justLeft = !onManage && wasOnManageRef.current
    wasOnManageRef.current = onManage

    // 离开沿：切离「收藏管理」时把筛选器整份清回默认。
    // 这样"从总览图表下钻 → 带筛选进来"仍然成立（下钻是 overview → manage，
    // 那一步 justLeft 为 false、justEntered 为 true，不会走到这里），
    // 而"进来过、又切到别的板块、再普通点回收藏管理"就是全量列表，
    // 不会挂着上一次下钻或上次手打的筛选。
    //
    // 必须拷一份 DEFAULT_FILTERS 再写：setFilters 是浅合并，直接把常量传进去
    // 会让后续合并写进同一个对象、把常量本身改掉（与 FilterBar.reset 同一条约定）。
    // 先判一次"确实脏了"再写：否则每次切走都换一个 filters 引用，Overview / Manage /
    // FilterBar 的 useMemo 会白重算一遍。
    if (justLeft) {
      const s = useRepoStore.getState()
      const dirty = (Object.keys(DEFAULT_FILTERS) as (keyof typeof DEFAULT_FILTERS)[]).some(
        (key) => s.filters[key] !== DEFAULT_FILTERS[key]
      )
      if (dirty) s.setFilters({ ...DEFAULT_FILTERS })
      return
    }

    if (!justEntered) return

    const s = useRepoStore.getState()
    // 已经有一批在跑（手动点了「检查更新」，或上一批还没回来）就不叠加
    if (s.syncingAll || s.updatingAll) return
    // 节流：同一会话里刚查过就不重复打整批 fetch
    if (s.syncCheckedAt !== null && Date.now() - s.syncCheckedAt < AUTO_CHECK_MIN_MS) return
    void s.checkAllLocalSync()
  }, [current])

  async function onRefresh(): Promise<void> {
    setSyncBusy(true)
    try {
      await refreshFromGitHub()
    } finally {
      setSyncBusy(false)
    }
  }

  async function onEnrich(): Promise<void> {
    setEnrichBusy(true)
    try {
      await enrich()
    } finally {
      setEnrichBusy(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        tab="manage"
        title="收藏管理"
        suffix={
          <span className="rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-fg-muted">
            {visible.length} / {repos.length}
            {behindCount > 0 ? ` · 落后 ${behindCount}` : ''}
          </span>
        }
        actions={
          <>
            <Button variant="primary" onClick={() => void onRefresh()} disabled={headerBusy}>
              {syncBusy ? '同步中…' : '从 GitHub 同步'}
            </Button>
            <Button
              onClick={() => void onEnrich()}
              disabled={headerBusy}
              title="让模型给还没分类的仓库补上分类；跑的时候按钮上会显示进度"
            >
              {enrichBusy ? enrichButtonLabel(enrichProgress) : 'AI 补全分类'}
            </Button>
            {/* 检查/更新走 store 的批量动作，忙碌态由 syncingAll / updatingAll 提供，
                不用本地 flag——它们本来就是全局唯一的批次状态。 */}
            <Button onClick={() => void checkAllLocalSync()} disabled={headerBusy}>
              {syncingAll ? '检查中…' : '检查更新'}
            </Button>
            <Button
              onClick={() => void updateAllLocal()}
              disabled={headerBusy || clonedCount === 0}
              title={
                clonedCount === 0
                  ? '还没有克隆到本地的仓库'
                  : `对 ${clonedCount} 个本地副本做快进更新，跳过有本地改动或已分叉的`
              }
            >
              {updatingAll ? '更新中…' : '更新全部'}
            </Button>
          </>
        }
      />

      <FilterBar />

      <RepoList visible={visible} />
    </PageContainer>
  )
}
