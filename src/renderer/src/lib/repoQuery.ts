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
import { activityBucket, type ActivityBucket } from './collectionStats'

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

/**
 * 语言筛选。
 *
 * `'unknown'` 这个态以前表达不出来：language 的类型是 `string | null`，
 * 而 null 早就被约定成「全部语言」了，于是「只看没有语言的仓库」无处安放
 * （FilterBar 里那条注释说的就是这个）。现在改成显式三态。
 *
 * 具体语言带 `name:` 前缀，是为了不与 `'unknown'` / `'all'` 这两个保留字撞车
 * ——真出现一个叫 "unknown" 的语言时，裸字符串会把它和保留态混为一谈。
 */
export type LanguageFilter = 'all' | 'unknown' | `name:${string}`

/** 语言筛选项的构造 / 解析。别在两处各写一遍前缀 */
export const languageOption = (name: string): LanguageFilter => `name:${name}`
export const languageNameOf = (filter: LanguageFilter): string | null =>
  filter.startsWith('name:') ? filter.slice('name:'.length) : null

/**
 * 语言下拉的候选项：从这批收藏里去重，按名字排序。
 *
 * ⚠️ 当前选中的那个语言必须**无条件**留在候选里，哪怕这批收藏里已经没有它的仓库。
 * 原生 <select> 的 value 找不到匹配的 option 时会变成"没有选中项"，界面上就是一片
 * 空白，而 store 里仍在按那个语言过滤——用户看到一个空列表，却看不出是哪个条件
 * 在起作用（连"重置"按钮都得靠 isDirty 才亮）。这正是本项目最忌讳的那类 bug：
 * 页面在安静地说谎。
 *
 * 会凑出这种数据是因为**重同步**：先按 Rust 筛，然后在 GitHub 上取消收藏最后一个
 * Rust 仓库，回来点一次同步——Rust 就从 repos 里消失了，而筛选器还指着它。
 *
 * 纯函数放在这里而不是组件里，是为了自检能直接喂数据把它卡住（渲染进程没有 DOM
 * 测试环境，组件里的这个判断写错了没人看得见）。
 */
export function languageOptions(repos: Repo[], current: LanguageFilter): string[] {
  const names = new Set<string>()
  for (const r of repos) {
    if (r.language !== null) names.add(r.language)
  }
  // 'all' / 'unknown' 是保留态，languageNameOf 对它们返回 null，不会混进候选
  const selected = languageNameOf(current)
  if (selected !== null) names.add(selected)
  return [...names].sort((a, b) => a.localeCompare(b))
}

/**
 * 活跃度筛选。三档各自对应总览页上的一个数字，判定复用 collectionStats 的
 * `activityBucket`——**只有一处阈值**，否则卡片写 40、这里筛出 38，页面在安静地撒谎。
 *
 * 刻意不把 'middle'（90~365 天）也做成一个选项：总览页上没有它对应的数字，
 * 单独放一个下拉项只会让人问「这是个啥」。它仍然能被「全部」看到。
 */
export type HealthFilter = 'all' | Extract<ActivityBucket, 'active' | 'stale' | 'unknown'>

export const HEALTH_OPTIONS: readonly { value: HealthFilter; label: string }[] = [
  { value: 'all', label: '全部活跃度' },
  { value: 'active', label: '近期活跃（90 天内）' },
  { value: 'stale', label: '可能已停更（一年以上）' },
  { value: 'unknown', label: '拿不到提交时间' }
] as const

/**
 * 分类筛选。
 *
 * 与语言那边同一个来由：`null` 早就被约定成「全部分类」了，于是「只看未分类」
 * 没有第三个态可用——而 `stats.uncategorized`（总览页那句「还有 N 个待补全」）
 * 恰恰是整页最可行动的数字，点不过去就等于没写。
 *
 * 这里**不需要** language 那种 `name:` 前缀：AiCategory 是固定 7 个枚举，取值域
 * 封闭，'all' / 'uncategorized' 不可能与某个真分类撞车。语言那边加了前缀，
 * 是因为它的取值域是「任意字符串」，真出现一个语言叫 "unknown" 时裸字符串
 * 会把两者混为一谈。
 */
export type CategoryFilter = 'all' | 'uncategorized' | AiCategory

export interface RepoFilters {
  keyword: string
  language: LanguageFilter
  category: CategoryFilter
  onlyCloned: boolean
  health: HealthFilter
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
  language: 'all',
  category: 'all',
  onlyCloned: false,
  health: 'all',
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
 *
 * `now` 必须显式传入（与 collectionStats 同一条约定）：活跃度是按「距今多久」判的，
 * 藏在函数里读时钟就没法喂假数据卡 90 / 365 天的边界。
 */
export function filterRepos(repos: Repo[], filters: RepoFilters, now: number): Repo[] {
  const keyword = filters.keyword.trim().toLowerCase()
  const language = languageNameOf(filters.language)

  return repos.filter((r) => {
    if (keyword) {
      const haystack = `${r.full_name} ${r.description ?? ''} ${(r.topics ?? []).join(' ')}`.toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    if (filters.language === 'unknown') {
      if (r.language !== null) return false
    } else if (language !== null && r.language !== language) {
      return false
    }
    // 未分类：判据必须与 collectionStats 里 categorized 的算法**逐字同源**——
    // 那边数的是 `if (r.ai_category)`，这里筛的是它的补集。两处口径一旦不同，
    // 「还有 N 个未分类」点进去就是另一个条数，而两边都"看着对"。
    if (filters.category === 'uncategorized') {
      if (r.ai_category) return false
    } else if (filters.category !== 'all' && r.ai_category !== filters.category) {
      return false
    }
    if (filters.onlyCloned && !r.local?.cloned_path) return false
    if (filters.health !== 'all' && activityBucket(r, now) !== filters.health) return false
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
export function selectRepos(repos: Repo[], filters: RepoFilters, now: number): Repo[] {
  return sortRepos(filterRepos(repos, filters, now), filters.sort)
}

/**
 * 从默认值出发、只覆盖指定几项的筛选器。给"下钻"用（总览页点统计卡跳到收藏管理）。
 *
 * ⚠️ 下钻必须**整份替换**，不能往用户当前的条件上合并。用户在管理页可能留着上次的
 * 搜索词或语言筛选，只 patch 一个字段的话，卡片上写着 12、点进去只有 3 条——
 * 数字对不上，而页面上没有任何东西提示"还叠着别的条件"。
 *
 * 从 DEFAULT_FILTERS 打底还顺带保证了两件事：新加的筛选字段不会漏（漏了就是
 * 悄悄少了一个条件），以及"下钻之后看到的东西"与"卡片上的数字"口径一致。
 */
export function filtersFor(patch: Partial<RepoFilters> = {}): RepoFilters {
  return { ...DEFAULT_FILTERS, ...patch }
}
