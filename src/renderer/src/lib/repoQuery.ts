/**
 * 收藏列表的筛选与排序（纯函数）。
 *
 * 单独成模块（而不是继续留在 store/repoStore.ts 里）的理由与 lib/collectionStats.ts 一致：
 * 排序的边界——「没有 pushed_at 的仓库该排在哪」「星标数相同时谁在前」——在界面上
 * 完全看不出来。列表还是那么长、也还是有内容，只是悄悄错了位，没人会发现。
 * 纯函数才能喂假数据把边界一条条卡住。
 *
 * ⚠️ 本文件**只依赖 @shared/types**，不 import lib/api 或任何组件（那些会拉进
 * React / window.api），这样自检脚本可以把本文件直接打包进 node 跑。
 * 同理，repoStore.ts 里**不能再留一份同名实现**——两处排序规则一定会漂移。
 */

import type { AiCategory, Repo } from '@shared/types'

/**
 * 列表排序方式。
 *
 * `starred_desc` 是默认值，且它与改动前的实际显示顺序**完全一致**：
 * main/github.ts 用的是 GET /user/starred，GitHub 默认就按 starred_at 倒序返回，
 * 收藏时新 Star 的又会 prepend 到列表最前。所以加排序不等于改了默认观感。
 */
export type RepoSort = 'starred_desc' | 'stars_desc' | 'pushed_desc' | 'name_asc'

/** 下拉框的选项。放这里而不是组件里：自检要断言每个 value 都有实现，反之亦然 */
export const REPO_SORTS: readonly { value: RepoSort; label: string }[] = [
  { value: 'starred_desc', label: '最近收藏' },
  { value: 'stars_desc', label: '星标最多' },
  { value: 'pushed_desc', label: '最近更新' },
  { value: 'name_asc', label: '名称 A→Z' }
] as const

export interface RepoFilters {
  keyword: string
  language: string | null
  category: AiCategory | null
  onlyCloned: boolean
  sort: RepoSort
}

/**
 * 筛选器的初始值，也是「重置」要回到的目标。
 *
 * ⚠️ 必须是唯一的一份：从前 store 里有个 INITIAL_FILTERS、FilterBar 里又有个
 * EMPTY_FILTERS，两份手工保持同步。这次加 sort 字段就是活例子——只改一处的话，
 * 「重置」会悄悄不重置排序，界面上看不出任何异常。
 *
 * 用之前记得 `{ ...DEFAULT_FILTERS }` 拷一份，别让 state 与这个常量共享引用。
 */
export const DEFAULT_FILTERS: RepoFilters = {
  keyword: '',
  language: null,
  category: null,
  onlyCloned: false,
  sort: 'starred_desc'
}

/**
 * 纯函数版筛选，visibleRepos() / 页面 useMemo 都复用它。
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

/** 把 ISO 时间串换成可比较的数字；拿不到时间一律当作「最旧」。 */
function time(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY
  const t = Date.parse(value)
  // 契约说 pushed_at 是 ISO 8601，但数据来自 GitHub 且要经一次落盘往返，
  // 解析失败时退化成「最旧」而不是 NaN——NaN 会把整个排序变成未定义行为。
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

/**
 * 时间倒序比较。
 *
 * ⚠️ 刻意不写成 `time(b) - time(a)`：两个都「拿不到时间」时差值是 NaN。
 * 规范确实会把 NaN 比较结果当 0 处理，但那是条隐式约定，读代码的人看不出
 * 这里依赖了它；写死方向更稳妥，也顺带让「都是 -Infinity」显式地判为相等。
 */
function laterFirst(a: string | null, b: string | null): number {
  const ta = time(a)
  const tb = time(b)
  if (ta === tb) return 0
  return tb > ta ? 1 : -1
}

/**
 * 按指定方式排序，**不修改入参**。
 *
 * 不原地排序是硬要求：repos 数组来自 zustand store，原地 sort 会直接改掉 store
 * 里的顺序，而这个顺序同时被周报、总览、推荐当作"收藏先后"在用。
 *
 * 比较函数返回 0 的情形（星标数相同、都没时间）依赖 Array#sort 的稳定性，
 * 让它们保持筛选后的原有顺序——也就是「最近收藏」的次序，这是有意义的兜底。
 */
export function sortRepos(repos: Repo[], sort: RepoSort): Repo[] {
  const sorted = [...repos]
  switch (sort) {
    case 'starred_desc':
      sorted.sort((a, b) => laterFirst(a.starred_at, b.starred_at))
      break
    case 'stars_desc':
      sorted.sort((a, b) => b.stargazers_count - a.stargazers_count)
      break
    case 'pushed_desc':
      sorted.sort((a, b) => laterFirst(a.pushed_at, b.pushed_at))
      break
    case 'name_asc':
      sorted.sort((a, b) => a.full_name.localeCompare(b.full_name))
      break
  }
  return sorted
}

/** 筛选 + 排序。页面和 store 都走这一个入口，别自己串。 */
export function selectRepos(repos: Repo[], filters: RepoFilters): Repo[] {
  return sortRepos(filterRepos(repos, filters), filters.sort)
}
