import { create } from 'zustand'
import type { Repo, AiCategory, LocalState } from '@shared/types'
import { unwrap, ipcErrorMessage } from '../lib/api'
import { pushToast } from '../components/common/Toast'

export interface RepoFilters {
  keyword: string
  language: string | null
  category: AiCategory | null
  onlyCloned: boolean
}

export interface RepoStore {
  repos: Repo[]
  loading: boolean
  // —— P6 新增（非契约成员；契约允许新增，见 renderer-contracts.md）——
  enriching: boolean
  error: string | null
  filters: RepoFilters
  visibleRepos(): Repo[]
  setFilters(patch: Partial<RepoFilters>): void
  load(): Promise<void>
  refreshFromGitHub(): Promise<void>
  enrich(): Promise<void>
  unstar(fullName: string): Promise<void>
  fork(fullName: string): Promise<void>
  clone(fullName: string): Promise<void>
  openDir(path: string): Promise<void>
  // —— 本地副本管理（非契约成员；新增不算修改契约，但必须同步进 renderer-contracts.md）——
  removeLocal(fullName: string): Promise<void>
  pruneLocalClones(): Promise<void>
  // —— 取消克隆（取消克隆 PR 落地）：裸调 window.api，失败才提示，false 不是错误 ——
  cancelClone(fullName: string): Promise<void>
  // —— P6 新增 token 方法 ——
  hasToken(): Promise<boolean>
  saveToken(token: string): Promise<void>
}

const INITIAL_FILTERS: RepoFilters = {
  keyword: '',
  language: null,
  category: null,
  onlyCloned: false
}

/**
 * 纯函数版筛选，visibleRepos() 直接复用它。
 * 单独抽出来有两个原因：
 * 1. 组件里不能写 useRepoStore((s) => s.visibleRepos())：它每次返回新数组，
 *    zustand v5 的 useSyncExternalStore 用严格相等比较快照，会判定值一直在变
 *    从而无限重渲染。组件要订阅 repos / filters 两个切片，自己算。
 * 2. 这样 useMemo 的依赖数组是"真的被用到"的，不会触发
 *    react-hooks/exhaustive-deps 的误报，也不需要写 eslint-disable。
 */
export function filterRepos(repos: Repo[], filters: RepoFilters): Repo[] {
  const keyword = filters.keyword.trim().toLowerCase()

  return repos.filter((r) => {
    if (keyword) {
      const haystack = `${r.full_name} ${r.description ?? ''} ${(r.topics ?? []).join(' ')}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    if (filters.language !== null && r.language !== filters.language) return false
    if (filters.category !== null && r.ai_category !== filters.category) return false
    if (filters.onlyCloned && !r.local?.cloned_path) return false
    return true
  })
}

/**
 * 把 GitHub 同步回来的远端数据与本地已有数据按 full_name 合并：
 * 以远端为基准，保留本地独有的 local / ai_summary / ai_category，
 * 避免每次同步丢掉「已 Fork / 已 clone / 已分类」标记（演示时最容易被发现的问题）。
 */
function mergeRepos(remote: Repo[], prev: Repo[]): Repo[] {
  const prevByFullName = new Map(prev.map((r) => [r.full_name, r]))
  return remote.map((r) => {
    const old = prevByFullName.get(r.full_name)
    if (!old) return r
    const merged: Repo = { ...r }
    if (old.local && !r.local) merged.local = old.local
    if (old.ai_summary && !r.ai_summary) merged.ai_summary = old.ai_summary
    if (old.ai_category && !r.ai_category) merged.ai_category = old.ai_category
    return merged
  })
}

/**
 * 内存态里抹掉某个仓库的 cloned_path。
 *
 * 必须显式 delete 后重建对象：写成 `{ ...r.local, cloned_path: undefined }` 是不行的，
 * 那个键会留在对象里（IPC 的结构化克隆和 JSON.stringify 才丢 undefined，内存里不丢），
 * 于是 `r.local?.cloned_path` 仍然是"有值"，卡片照样画成已克隆。
 */
function withoutClonedPath(repo: Repo): Repo {
  if (!repo.local?.cloned_path) return repo
  const local: LocalState = { ...repo.local }
  delete local.cloned_path
  return { ...repo, local }
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  repos: [],
  loading: false,
  enriching: false,
  error: null,
  filters: { ...INITIAL_FILTERS },

  visibleRepos() {
    const { repos, filters } = get()
    return filterRepos(repos, filters)
  },

  setFilters(patch) {
    set((s) => ({ filters: { ...s.filters, ...patch } }))
  },

  async load() {
    set({ loading: true })
    let loaded = false
    try {
      set({ repos: await unwrap(window.api.store.getRepos()) })
      loaded = true
    } catch (err) {
      // unwrap 已经弹过 toast；这里只写 error 字段、保留旧数据，不把 repos 清空
      set({ error: ipcErrorMessage(err) })
    } finally {
      set({ loading: false })
    }

    // 对账：把"记录里有、磁盘上已经被用户删掉"的 cloned_path 静默清掉，卡片自然
    // 回到 [Clone] 态。折在 load() 里而不是让 Dashboard 自己调，是为了不动 P5 的文件。
    // 只在真的读到列表时才跑；pruneLocalClones 内部绝不抛，不会影响上面的加载结果。
    if (loaded) await get().pruneLocalClones()
  },

  async refreshFromGitHub() {
    set({ loading: true, error: null })
    try {
      const remote = await unwrap(window.api.github.fetchStarred())
      const merged = mergeRepos(remote, get().repos)
      await unwrap(window.api.store.saveRepos(merged))
      set({ repos: merged })
      pushToast({ type: 'success', message: `已从 GitHub 同步 ${merged.length} 个仓库` })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    } finally {
      set({ loading: false })
    }
  },

  async enrich() {
    if (get().enriching) return
    set({ enriching: true, error: null })
    try {
      // 落盘由主进程的 ai.enrichRepos 负责，渲染进程只更新本地列表
      set({ repos: await unwrap(window.api.ai.enrichRepos(get().repos)) })
      pushToast({ type: 'success', message: 'AI 分类补全完成' })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    } finally {
      set({ enriching: false })
    }
  },

  async unstar(fullName) {
    try {
      await unwrap(window.api.github.unstar(fullName))
      // 主进程已改 store，这里同步内存态：从本地列表过滤掉该仓库
      set((s) => ({ repos: s.repos.filter((r) => r.full_name !== fullName) }))
      pushToast({ type: 'success', message: '已取消 Star' })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async fork(fullName) {
    try {
      const repo = await unwrap(window.api.github.fork(fullName))
      const forkedAt = new Date().toISOString()
      const local: LocalState = {
        ...(repo.local ?? {}),
        forked_full_name: repo.full_name,
        forked_at: forkedAt
      }
      set((s) => ({
        repos: s.repos.map((r) => (r.full_name === fullName ? { ...repo, local } : r))
      }))
      await unwrap(
        window.api.store.updateLocalState(fullName, {
          forked_full_name: repo.full_name,
          forked_at: forkedAt
        })
      )
      pushToast({ type: 'success', message: `已 Fork 到 ${repo.full_name}` })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async clone(fullName) {
    try {
      const dir = await unwrap(window.api.local.chooseDir())
      if (dir === null) return // 用户取消选目录，静默返回，不当成错误

      // 刻意裸调、不用 unwrap()：主进程的 clone 现在用 data === null 表示"已被用户
      // 取消"——那是一次成功但无结果的调用，不能按失败处理。而 unwrap 在 { ok: false }
      // 时会先弹一条红 toast 再抛错，只有真失败才该弹，取消必须静默。
      const res = await window.api.local.clone(fullName, dir)
      if (!res.ok) {
        set({ error: res.error })
        pushToast({ type: 'error', message: res.error })
        return
      }
      if (res.data === null) return // 已取消：静默成功，不弹提示、不写 store

      const path = res.data
      // 主进程的 local.clone 只建目录，不写 db；cloned_path 必须由这里落盘，
      // 否则 onlyCloned 筛选永远命中不到任何仓库
      await unwrap(window.api.store.updateLocalState(fullName, { cloned_path: path }))
      set((s) => ({
        repos: s.repos.map((r) =>
          r.full_name === fullName ? { ...r, local: { ...r.local, cloned_path: path } } : r
        )
      }))
      pushToast({ type: 'success', message: `已克隆到 ${path}` })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async cancelClone(fullName) {
    try {
      // 同样裸调：取消的成败由主进程用布尔值表达，data === false 是"本来没人在跑"
      // 的正常竞态，不是错误，走 unwrap 反而会把 false 当成要处理的结果。
      const res = await window.api.local.cancelClone(fullName)
      if (!res.ok) {
        console.error('[repoStore] 取消克隆失败：', res.error)
        pushToast({ type: 'error', message: res.error })
      }
      // 成功静默：无论确实中止了（true）还是本来就没人在跑（false）
    } catch (err) {
      console.error('[repoStore] 取消克隆失败：', err)
      pushToast({ type: 'error', message: ipcErrorMessage(err) })
    }
  },

  async openDir(path) {
    try {
      await unwrap(window.api.local.openDir(path))
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async removeLocal(fullName) {
    try {
      const removed = await unwrap(window.api.local.removeClone(fullName))
      // 必须换新数组、换新对象：原地改 zustand 里的对象不触发重渲染，
      // 而且 TypeScript 完全不会提醒你写错了
      set((s) => ({
        repos: s.repos.map((r) => (r.full_name === fullName ? withoutClonedPath(r) : r))
      }))
      // 用主进程返回的实际路径：确认框显示的是渲染进程内存里的路径，两者理论上是两份数据
      pushToast({
        type: 'success',
        message: removed ? `已删除本地副本：${removed}` : '本地副本早已不在，只清掉了记录'
      })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async pruneLocalClones() {
    try {
      // 刻意不走 unwrap / call：那两个封装（lib/api.ts）都会弹 toast，而对账必须是静默的
      // ——它挂在每次 load() 后面，用 unwrap 就等于每次切回 Dashboard 都弹一条，
      // 而且弹的还是用户没做过任何操作的一条提示。
      const res = await window.api.local.pruneClones()
      if (!res.ok || res.data.length === 0) return

      const cleared = new Set(res.data)
      set((s) => ({
        repos: s.repos.map((r) => (cleared.has(r.full_name) ? withoutClonedPath(r) : r))
      }))
      console.log('[repoStore] 对账清除本地副本记录：', res.data)
    } catch (err) {
      // 对账失败绝不能影响列表加载，也不打扰用户，只留一条排查日志
      console.warn('[repoStore] 本地副本对账失败，已忽略', err)
    }
  },

  async hasToken() {
    try {
      return await unwrap(window.api.store.hasToken())
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
      return false
    }
  },

  async saveToken(token) {
    try {
      await unwrap(window.api.store.saveToken(token))
      pushToast({ type: 'success', message: '已保存' })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  }
}))
