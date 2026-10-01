import { create } from 'zustand'
import type { Repo, AiCategory } from '@shared/types'
import { unwrap } from '../lib/api'
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
      const haystack = `${r.full_name} ${r.description ?? ''}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    if (filters.language !== null && r.language !== filters.language) return false
    if (filters.category !== null && r.ai_category !== filters.category) return false
    if (filters.onlyCloned && !r.local?.cloned_path) return false
    return true
  })
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  repos: [],
  loading: false,
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
    } catch {
      // unwrap 已经弹过 toast，这里只需要别把 loading 卡住、也别抛给调用方
    } finally {
      set({ loading: false })
    }
  },

  async refreshFromGitHub() {
    set({ loading: true })
    try {
      const repos = await unwrap(window.api.github.fetchStarred())
      await unwrap(window.api.store.saveRepos(repos))
      set({ repos })
      pushToast({ type: 'success', message: `已从 GitHub 同步 ${repos.length} 个仓库` })
    } catch {
      // unwrap 已经弹过 toast
    } finally {
      set({ loading: false })
    }
  },

  async enrich() {
    set({ loading: true })
    try {
      // 落盘由主进程的 ai.enrichRepos 负责，渲染进程只更新本地列表
      set({ repos: await unwrap(window.api.ai.enrichRepos(get().repos)) })
      pushToast({ type: 'success', message: 'AI 分类补全完成' })
    } catch {
      // unwrap 已经弹过 toast
    } finally {
      set({ loading: false })
    }
  },

  async unstar(fullName) {
    try {
      await unwrap(window.api.github.unstar(fullName))
      // 主进程已经把 store 里的这条删了，重新拉一遍保证两边一致
      await get().load()
      pushToast({ type: 'success', message: '已取消 Star' })
    } catch {
      // unwrap 已经弹过 toast
    }
  },

  async fork(fullName) {
    try {
      const forked = await unwrap(window.api.github.fork(fullName))
      set((s) => ({
        repos: s.repos.map((r) => (r.full_name === fullName ? forked : r))
      }))
      await unwrap(window.api.store.updateLocalState(fullName, forked.local ?? {}))
      const target = forked.local?.forked_full_name ?? forked.full_name
      pushToast({ type: 'success', message: `已 Fork 到 ${target}` })
    } catch {
      // unwrap 已经弹过 toast
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
      pushToast({ type: 'success', message: `已 Clone 到 ${path}` })
    } catch {
      // unwrap 已经弹过 toast
    }
  },

  async openDir(path) {
    try {
      await unwrap(window.api.local.openDir(path))
    } catch {
      // unwrap 已经弹过 toast
    }
  }
}))
