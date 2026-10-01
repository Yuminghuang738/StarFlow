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
    try {
      set({ repos: await unwrap(window.api.store.getRepos()) })
    } catch (err) {
      // unwrap 已经弹过 toast；这里只写 error 字段、保留旧数据，不把 repos 清空
      set({ error: ipcErrorMessage(err) })
    } finally {
      set({ loading: false })
    }
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

      const path = await unwrap(window.api.local.clone(fullName, dir))
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

  async openDir(path) {
    try {
      await unwrap(window.api.local.openDir(path))
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
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
