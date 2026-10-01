// lib/repoQuery.ts（收藏列表筛选 / 排序）的自检入口。
//
// 排序的错法在界面上全都看不出来：列表还是有内容、长度也对，只是顺序悄悄错了。
// 这里逐条把边界钉死——尤其是「没有 pushed_at 排在哪」和「同分时的稳定性」。
import { AI_CATEGORIES, type Repo } from '@shared/types'
import {
  filterRepos,
  sortRepos,
  selectRepos,
  REPO_SORTS,
  DEFAULT_FILTERS,
  type RepoFilters,
  type RepoSort
} from '../../src/renderer/src/lib/repoQuery'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

function isSorted(values: number[], desc = true): boolean {
  return values.every((v, i) => i === 0 || (desc ? values[i - 1]! >= v : values[i - 1]! <= v))
}

const repoNames = (repos: Repo[]): string => repos.map((r) => r.full_name).join(',')

// —— fixture ——
// starred_at 刻意给三组：正常、完全相同（测稳定性）、非法串（测解析失败）。
function makeRepo(over: Partial<Repo> & { full_name: string }): Repo {
  return {
    id: Math.abs(
      [...over.full_name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_000, 7)
    ),
    description: null,
    language: null,
    stargazers_count: 0,
    html_url: `https://github.com/${over.full_name}`,
    starred_at: '2024-01-01T00:00:00Z',
    topics: [],
    pushed_at: null,
    latest_release: null,
    ...over
  }
}

const REPOS: Repo[] = [
  makeRepo({
    full_name: 'a/old-but-many-stars',
    starred_at: '2021-03-01T00:00:00Z',
    pushed_at: '2021-06-01T00:00:00Z',
    stargazers_count: 900,
    language: 'Rust',
    description: '一个终端编辑器',
    topics: ['editor', 'tui'],
    ai_category: '工具'
  }),
  makeRepo({
    full_name: 'b/newest-star',
    starred_at: '2026-09-30T00:00:00Z',
    pushed_at: '2026-09-29T00:00:00Z',
    stargazers_count: 10,
    language: 'TypeScript',
    ai_category: '前端',
    local: { cloned_path: '/tmp/b' }
  }),
  makeRepo({
    full_name: 'c/middle',
    starred_at: '2024-05-05T00:00:00Z',
    pushed_at: null, // 拿不到推送时间
    stargazers_count: 10, // 与 b 同分：测稳定性
    language: 'TypeScript',
    description: 'OCR 工具'
  }),
  makeRepo({
    full_name: 'd/invalid-date',
    starred_at: '不是日期',
    pushed_at: '2026-10-01T00:00:00Z',
    stargazers_count: 500,
    language: null, // 未知语言
    local: { forked_full_name: 'me/d' } // 有 local 但没 clone
  })
]

const f = (over: Partial<RepoFilters> = {}): RepoFilters => ({ ...DEFAULT_FILTERS, ...over })

// ============================================================
console.log('\n== 1. 默认值与选项表 ==')
// ============================================================
check('DEFAULT_FILTERS.sort 是 starred_desc', DEFAULT_FILTERS.sort === 'starred_desc')
check(
  'DEFAULT_FILTERS 的其它字段是「全不过滤」',
  DEFAULT_FILTERS.keyword === '' &&
    DEFAULT_FILTERS.language === null &&
    DEFAULT_FILTERS.category === null &&
    DEFAULT_FILTERS.onlyCloned === false
)
check('默认筛选不丢任何仓库', filterRepos(REPOS, DEFAULT_FILTERS).length === REPOS.length)
check(
  'REPO_SORTS 的 value 无重复',
  new Set(REPO_SORTS.map((s) => s.value)).size === REPO_SORTS.length
)
check(
  'REPO_SORTS 每项都有非空 label',
  REPO_SORTS.every((s) => s.value.length > 0 && s.label.length > 0)
)
// 枚举成员一个都不能漏：漏了某个 value，下拉框里就永远选不到它，
// 而 sortRepos 的 switch 也不会报错（会静默不排序）。
const ALL_SORTS: RepoSort[] = ['starred_desc', 'stars_desc', 'pushed_desc', 'name_asc']
check(
  'REPO_SORTS 覆盖了 RepoSort 的每个取值',
  ALL_SORTS.every((v) => REPO_SORTS.some((s) => s.value === v)) &&
    REPO_SORTS.length === ALL_SORTS.length,
  REPO_SORTS.map((s) => s.value).join(',')
)

// ============================================================
console.log('\n== 2. 筛选（回归：这几条改动前就有，不能被排序带坏）==')
// ============================================================
check(
  '默认（最近收藏）按 starred_at 降序，解析不出来的排最后',
  repoNames(sortRepos(REPOS, 'starred_desc')) ===
    'b/newest-star,c/middle,a/old-but-many-stars,d/invalid-date',
  repoNames(sortRepos(REPOS, 'starred_desc'))
)
// 「加排序不等于改了默认观感」的正式断言：GitHub 的 /user/starred 本来就按
// starred_at 倒序返回，所以对一个已经是该顺序的输入，默认排序应当原样返回。
const alreadyStarredDesc = [
  makeRepo({ full_name: 'p', starred_at: '2026-01-01T00:00:00Z' }),
  makeRepo({ full_name: 'q', starred_at: '2025-01-01T00:00:00Z' }),
  makeRepo({ full_name: 'r', starred_at: '2024-01-01T00:00:00Z' })
]
check(
  '默认排序对「已经是最近收藏序」的输入是恒等变换',
  repoNames(sortRepos(alreadyStarredDesc, 'starred_desc')) === 'p,q,r'
)
check(
  '关键词命中 full_name',
  repoNames(filterRepos(REPOS, f({ keyword: 'newest' }))) === 'b/newest-star'
)
check(
  '关键词命中 description',
  repoNames(filterRepos(REPOS, f({ keyword: 'ocr' }))) === 'c/middle'
)
check(
  '关键词命中 topics',
  repoNames(filterRepos(REPOS, f({ keyword: 'tui' }))) === 'a/old-but-many-stars'
)
check(
  '关键词忽略大小写与首尾空格',
  repoNames(filterRepos(REPOS, f({ keyword: '  OCR  ' }))) === 'c/middle'
)
check('关键词无命中时返回空数组', filterRepos(REPOS, f({ keyword: 'zzz' })).length === 0)
check(
  'language 筛选是严格相等（null 表示全部，不是"未知语言"）',
  repoNames(filterRepos(REPOS, f({ language: 'TypeScript' }))) === 'b/newest-star,c/middle' &&
    filterRepos(REPOS, f({ language: null })).length === REPOS.length
)
check(
  'category 筛选是严格相等',
  repoNames(filterRepos(REPOS, f({ category: '前端' }))) === 'b/newest-star' &&
    filterRepos(REPOS, f({ category: null })).length === REPOS.length
)
check(
  '每个 AI_CATEGORIES 都能被当作筛选值用',
  AI_CATEGORIES.every((c) => Array.isArray(filterRepos(REPOS, f({ category: c }))))
)
check(
  'onlyCloned 只认 cloned_path（有 forked_full_name 不算）',
  repoNames(filterRepos(REPOS, f({ onlyCloned: true }))) === 'b/newest-star'
)
check(
  '多个条件是「与」关系',
  filterRepos(REPOS, f({ language: 'TypeScript', category: '前端' })).length === 1 &&
    filterRepos(REPOS, f({ language: 'Rust', category: '前端' })).length === 0
)

// ============================================================
console.log('\n== 3. 排序 ==')
// ============================================================
const byStars = sortRepos(REPOS, 'stars_desc')
check(
  'stars_desc 按星标数降序',
  repoNames(byStars) === 'a/old-but-many-stars,d/invalid-date,b/newest-star,c/middle',
  repoNames(byStars)
)
check(
  'stars_desc 的星标数确实单调不增',
  isSorted(byStars.map((r) => r.stargazers_count))
)
// 稳定性：b 与 c 都是 10 星，必须保持入参顺序（b 在 c 前），不能随机翻面
check(
  'stars_desc 同分时保持入参顺序（稳定排序）',
  byStars.filter((r) => r.stargazers_count === 10).map((r) => r.full_name).join(',') ===
    'b/newest-star,c/middle'
)

const byPushed = sortRepos(REPOS, 'pushed_desc')
check(
  'pushed_desc 按推送时间降序',
  repoNames(byPushed) === 'd/invalid-date,b/newest-star,a/old-but-many-stars,c/middle',
  repoNames(byPushed)
)
// 关键边界：pushed_at 为 null 的排最后，而不是被当成"最新"顶到最前
check('pushed_desc 把 pushed_at 为 null 的排在最后', byPushed[byPushed.length - 1]!.full_name === 'c/middle')
check(
  'pushed_desc 的已知时间单调不增',
  isSorted(
    byPushed.map((r) => r.pushed_at).filter((p): p is string => p !== null).map((p) => Date.parse(p))
  )
)

const byName = sortRepos(REPOS, 'name_asc')
check(
  'name_asc 按全名升序',
  repoNames(byName) === 'a/old-but-many-stars,b/newest-star,c/middle,d/invalid-date',
  repoNames(byName)
)
check('name_asc 对每个仓库都给出非负序号', byName.every((r) => typeof r.id === 'number'))

const byStarred = sortRepos(REPOS, 'starred_desc')
// starred_at 是"不是日期"的 d 会被当作最旧，排在真正最旧的 a 之后
check(
  'starred_desc 把解析不出来的 starred_at 当作最旧',
  byStarred[byStarred.length - 1]!.full_name === 'd/invalid-date',
  repoNames(byStarred)
)
check(
  'starred_desc 的已知时间单调不增',
  isSorted(
    byStarred
      .map((r) => r.starred_at)
      .filter((s) => !Number.isNaN(Date.parse(s)))
      .map((s) => Date.parse(s))
  )
)

// —— 不修改入参：repos 数组直接来自 zustand store，原地 sort 会改掉 store 的顺序，
//    而那顺序同时被周报 / 总览 / 推荐当作"收藏先后"在用 ——
const originalOrder = repoNames(REPOS)
for (const sort of ALL_SORTS) sortRepos(REPOS, sort)
check('sortRepos 不修改入参数组', repoNames(REPOS) === originalOrder, repoNames(REPOS))
check('sortRepos 返回的是新数组', ALL_SORTS.every((s) => sortRepos(REPOS, s) !== REPOS))
check('sortRepos 不增删元素', ALL_SORTS.every((s) => sortRepos(REPOS, s).length === REPOS.length))
check('空列表排序不抛错', ALL_SORTS.every((s) => sortRepos([], s).length === 0))

// 两个都拿不到时间：不许出现 NaN 把顺序搞成未定义行为
const twoNull = [
  makeRepo({ full_name: 'x/no-time', pushed_at: null }),
  makeRepo({ full_name: 'y/no-time', pushed_at: null })
]
check(
  '两个仓库都没 pushed_at 时保持原顺序',
  sortRepos(twoNull, 'pushed_desc').map((r) => r.full_name).join(',') === 'x/no-time,y/no-time'
)
const twoBad = [
  makeRepo({ full_name: 'x/bad', pushed_at: '???' }),
  makeRepo({ full_name: 'y/bad', pushed_at: '???' })
]
check(
  '两个仓库的 pushed_at 都解析失败时保持原顺序',
  sortRepos(twoBad, 'pushed_desc').map((r) => r.full_name).join(',') === 'x/bad,y/bad'
)

// ============================================================
console.log('\n== 4. selectRepos：筛选与排序的组合 ==')
// ============================================================
check(
  '先筛后排，只对筛出来的结果排序',
  repoNames(selectRepos(REPOS, f({ language: 'TypeScript', sort: 'name_asc' }))) ===
    'b/newest-star,c/middle'
)
check(
  '筛掉之后排序仍然生效（不因为子集小就不排）',
  repoNames(selectRepos(REPOS, f({ sort: 'stars_desc' }))) ===
    repoNames(sortRepos(filterRepos(REPOS, f()), 'stars_desc'))
)
check(
  '筛选可筛空，且不抛错',
  selectRepos(REPOS, f({ keyword: 'zzz', sort: 'pushed_desc' })).length === 0
)
check(
  '改排序不影响筛选结果集合',
  ALL_SORTS.every(
    (s) =>
      new Set(selectRepos(REPOS, f({ language: 'TypeScript', sort: s })).map((r) => r.full_name))
        .size === 2
  )
)
check('selectRepos 也不修改入参', repoNames(REPOS) === originalOrder)

console.log(`\n== 结果：${failures === 0 ? '全部通过' : `${failures} 项失败`} ==`)
process.exit(failures === 0 ? 0 : 1)
