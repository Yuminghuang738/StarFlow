// lib/repoQuery.ts（收藏列表筛选 / 排序）的自检入口。
//
// 筛选与排序的错法在界面上全都看不出来：列表还是有内容、长度也差不多，
// 只是内容或者顺序悄悄错了。这里逐条把边界钉死。
import { AI_CATEGORIES, type Repo } from '@shared/types'
import {
  filterRepos,
  sortRepos,
  selectRepos,
  REPO_SORTS,
  HEALTH_OPTIONS,
  DEFAULT_FILTERS,
  filtersFor,
  languageOption,
  languageOptions,
  languageNameOf,
  type RepoFilters,
  type RepoSort,
  type LanguageFilter
} from '../../src/renderer/src/lib/repoQuery'
import {
  activityBucket,
  computeCollectionStats,
  isRealCategory,
  UNCATEGORIZED_LABEL
} from '../../src/renderer/src/lib/collectionStats'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

function isSorted(values: number[], desc = true): boolean {
  return values.every((v, i) => i === 0 || (desc ? values[i - 1]! >= v : values[i - 1]! <= v))
}

/** 固定「此刻」。活跃度是 90 / 365 天的阈值，绝不读真实时钟，否则断言会随日期漂移 */
const NOW = Date.parse('2026-10-02T00:00:00Z')
const DAY = 86_400_000
const daysAgo = (n: number): string => new Date(NOW - n * DAY).toISOString()

const names = (repos: Repo[]): string => repos.map((r) => r.full_name).join(',')
const F = (over: Partial<RepoFilters> = {}): RepoFilters => ({ ...DEFAULT_FILTERS, ...over })
const vis = (over: Partial<RepoFilters> = {}): Repo[] => filterRepos(REPOS, F(over), NOW)

// —— fixture ——
// 六条各自承担一个边界：
//   a  星标最多 + 已停更（2000 天没 push）
//   b  最近收藏（starred_at 最新）+ 近期活跃（3 天前 push）
//   c  拿不到推送时间（pushed_at = null）+ 没有 ai_category（未分类）
//   d  starred_at 解析不出来 + 星标第二多 + 没有 ai_category（未分类）
//   e  落在 90~365 天的空档里（既不算活跃也不算停更）——这一条专门守
//      「三档不是划分」这件事
//   f  语言名字就叫 "unknown"，用来验证语言筛选的 name: 前缀确实区分了保留字
function makeRepo(over: Partial<Repo> & { full_name: string }): Repo {
  return {
    id: Math.abs([...over.full_name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_000, 7)),
    description: null,
    language: null,
    stargazers_count: 0,
    html_url: `https://github.com/${over.full_name}`,
    starred_at: daysAgo(100),
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
    pushed_at: daysAgo(2000),
    stargazers_count: 900,
    language: 'Rust',
    description: '一个终端编辑器',
    topics: ['editor', 'tui'],
    ai_category: '工具'
  }),
  makeRepo({
    full_name: 'b/newest-star',
    starred_at: '2026-09-30T00:00:00Z',
    pushed_at: daysAgo(3),
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
    pushed_at: daysAgo(1),
    stargazers_count: 500,
    language: null, // 未知语言
    local: { forked_full_name: 'me/d' } // 有 local 但没 clone
  }),
  makeRepo({
    full_name: 'e/middle-band',
    starred_at: '2025-07-07T00:00:00Z',
    pushed_at: daysAgo(200), // 90 < 200 < 365：三档都不算它
    stargazers_count: 300,
    language: 'Go',
    ai_category: '后端'
  }),
  makeRepo({
    full_name: 'f/language-named-unknown',
    starred_at: '2025-01-01T00:00:00Z',
    pushed_at: daysAgo(500),
    stargazers_count: 50,
    language: 'unknown', // 真的有个语言叫这个
    ai_category: '其他'
  })
]

// ============================================================
console.log('\n== 1. 默认值与选项表 ==')
// ============================================================
check('DEFAULT_FILTERS.sort 是 starred_desc', DEFAULT_FILTERS.sort === 'starred_desc')
check('DEFAULT_FILTERS.language 是 all', DEFAULT_FILTERS.language === 'all')
check('DEFAULT_FILTERS.health 是 all', DEFAULT_FILTERS.health === 'all')
check('DEFAULT_FILTERS.category 是 all', DEFAULT_FILTERS.category === 'all')
check(
  'DEFAULT_FILTERS 的其它字段是「全不过滤」',
  DEFAULT_FILTERS.keyword === '' && DEFAULT_FILTERS.onlyCloned === false
)
check('默认筛选不丢任何仓库', vis().length === REPOS.length)
check('REPO_SORTS 的 value 无重复', new Set(REPO_SORTS.map((s) => s.value)).size === REPO_SORTS.length)
check(
  'REPO_SORTS 每项都有非空 label',
  REPO_SORTS.every((s) => s.value.length > 0 && s.label.length > 0)
)
// 枚举成员一个都不能漏：漏了某个 value，下拉框里就永远选不到它，
// 而 sortRepos 的 switch 也不会报错（会静默不排序）。
const ALL_SORTS: RepoSort[] = ['starred_desc', 'stars_desc', 'pushed_desc', 'name_asc']
check(
  'REPO_SORTS 覆盖了 RepoSort 的每个取值',
  ALL_SORTS.every((v) => REPO_SORTS.some((s) => s.value === v)) && REPO_SORTS.length === ALL_SORTS.length,
  REPO_SORTS.map((s) => s.value).join(',')
)
check(
  'HEALTH_OPTIONS 恰好是 all + 三个可筛的档',
  HEALTH_OPTIONS.length === 4 &&
    HEALTH_OPTIONS[0]!.value === 'all' &&
    new Set(HEALTH_OPTIONS.map((h) => h.value)).size === 4 &&
    HEALTH_OPTIONS.every((h) => h.label.length > 0),
  HEALTH_OPTIONS.map((h) => h.value).join(',')
)

// ============================================================
console.log('\n== 2. 筛选：关键词 / 分类 / clone ==')
// ============================================================
check('关键词命中 full_name', names(vis({ keyword: 'newest' })) === 'b/newest-star')
check('关键词命中 description', names(vis({ keyword: 'ocr' })) === 'c/middle')
check('关键词命中 topics', names(vis({ keyword: 'tui' })) === 'a/old-but-many-stars')
check('关键词忽略大小写与首尾空格', names(vis({ keyword: '  OCR  ' })) === 'c/middle')
check('关键词无命中时返回空数组', vis({ keyword: 'zzz' }).length === 0)
check('category 筛选是严格相等', names(vis({ category: '前端' })) === 'b/newest-star')
check('category 为 all 表示全部分类', vis({ category: 'all' }).length === REPOS.length)
check(
  '每个 AI_CATEGORIES 都能被当作筛选值用',
  AI_CATEGORIES.every((c) => Array.isArray(vis({ category: c })))
)
check(
  'onlyCloned 只认 cloned_path（有 forked_full_name 不算）',
  names(vis({ onlyCloned: true })) === 'b/newest-star'
)
check(
  '多个条件是「与」关系',
  names(vis({ category: '前端', onlyCloned: true })) === 'b/newest-star' &&
    vis({ category: '前端', onlyCloned: false, health: 'stale' }).length === 0
)

// ============================================================
console.log('\n== 3. 语言筛选的三态 ==')
// ============================================================
check('languageOption 加 name: 前缀', languageOption('Rust') === 'name:Rust')
check(
  'languageNameOf 能解回语言名',
  languageNameOf(languageOption('TypeScript')) === 'TypeScript'
)
// 关键：两个保留态都不能被当成语言名，否则 filterRepos 会拿 'all'/'unknown'
// 去和 r.language 比，结果恒为空列表（这正是改之前那个补不了的洞）
check('languageNameOf(all) 不是语言名', languageNameOf('all') === null)
check('languageNameOf(unknown) 不是语言名', languageNameOf('unknown') === null)
check(
  'name:unknown 与保留态 unknown 是两个不同的值',
  languageOption('unknown') !== 'unknown' && languageOption('all') !== 'all'
)

check('language 为 all 时不过滤', vis({ language: 'all' }).length === REPOS.length)
check(
  '具体语言按名字严格相等',
  names(vis({ language: languageOption('TypeScript') })) === 'b/newest-star,c/middle'
)
check(
  '语言名恰好叫 unknown 的仓库不会被保留态 unknown 误伤',
  names(vis({ language: 'unknown' })) === 'd/invalid-date' &&
    names(vis({ language: languageOption('unknown') })) === 'f/language-named-unknown',
  `${names(vis({ language: 'unknown' }))} | ${names(vis({ language: languageOption('unknown') }))}`
)
check('未知语言筛选只取 language === null 的', names(vis({ language: 'unknown' })) === 'd/invalid-date')
check(
  '不存在的语言筛出空列表',
  vis({ language: 'name:Cobol' as LanguageFilter }).length === 0
)

// ============================================================
console.log('\n== 4. 活跃度筛选 ==')
// ============================================================
check(
  'activityBucket 分档符合阈值',
  activityBucket(REPOS[0]!, NOW) === 'stale' && // 2000 天
    activityBucket(REPOS[1]!, NOW) === 'active' && // 3 天
    activityBucket(REPOS[2]!, NOW) === 'unknown' && // null
    activityBucket(REPOS[4]!, NOW) === 'middle' && // 200 天
    activityBucket(REPOS[5]!, NOW) === 'stale',
  REPOS.map((r) => activityBucket(r, NOW)).join(',')
)
check('active 筛出 90 天内推送的', names(vis({ health: 'active' })) === 'b/newest-star,d/invalid-date')
check('stale 筛出一年以上没推送的', names(vis({ health: 'stale' })) === 'a/old-but-many-stars,f/language-named-unknown')
check('unknown 筛出拿不到推送时间的', names(vis({ health: 'unknown' })) === 'c/middle')
check('health 为 all 时不过滤', vis({ health: 'all' }).length === REPOS.length)

// ⚠️ 三档**不是划分**：90~365 天之间（e/middle-band）哪一档都不算。
// 这条断言是为了防止有人"顺手"把三档改成互斥且完备——那样上面的卡片就不对了。
check(
  '90~365 天之间的仓库不属于任何一档',
  vis({ health: 'active' }).every((r) => r.full_name !== 'e/middle-band') &&
    vis({ health: 'stale' }).every((r) => r.full_name !== 'e/middle-band') &&
    vis({ health: 'unknown' }).every((r) => r.full_name !== 'e/middle-band')
)
check(
  '三档相加小于总数（因为有 90~365 天这段空档）',
  ['active', 'stale', 'unknown'].reduce<number>((n, h) => n + vis({ health: h as 'active' }).length, 0) <
    REPOS.length
)
// 边界：刚好 90 天不算 active（判据是 age < 90d），刚好 365 天算 stale
check(
  '刚好 90 天前推送的**不算**近期活跃',
  activityBucket(makeRepo({ full_name: 'x/90d', pushed_at: daysAgo(90) }), NOW) === 'middle'
)
check(
  '刚好 365 天前推送的**算**已停更',
  activityBucket(makeRepo({ full_name: 'x/365d', pushed_at: daysAgo(365) }), NOW) === 'stale'
)
check(
  '365 天差一毫秒不算停更',
  activityBucket(makeRepo({ full_name: 'x/365m', pushed_at: new Date(NOW - 365 * DAY + 1).toISOString() }), NOW) ===
    'middle'
)

// —— 本轮最重要的一条：**总览卡片上的数字必须等于这里筛出来的条数** ——
// 两边共用 activityBucket 就是为了这个。各写一遍 if 迟早会漂移，
// 而漂移之后页面只是在安静地撒谎。
const stats = computeCollectionStats(REPOS, NOW)
check(
  '总览「近期活跃」的数字 == active 筛出的条数',
  stats.activeRecently === vis({ health: 'active' }).length,
  `${stats.activeRecently} vs ${vis({ health: 'active' }).length}`
)
check(
  '总览「可能已停更」的数字 == stale 筛出的条数',
  stats.stale === vis({ health: 'stale' }).length,
  `${stats.stale} vs ${vis({ health: 'stale' }).length}`
)
check(
  '总览「拿不到提交时间」的数字 == unknown 筛出的条数',
  stats.unknownPush === vis({ health: 'unknown' }).length,
  `${stats.unknownPush} vs ${vis({ health: 'unknown' }).length}`
)
check(
  '总览「语言数」与语言下拉的去重数一致',
  stats.languageCount === new Set(REPOS.map((r) => r.language).filter((l): l is string => l !== null)).size
)
check(
  '总览「AI 已分类」与「分类不为 null」的条数一致',
  stats.categorized === REPOS.filter((r) => r.ai_category !== undefined).length
)

// ============================================================
console.log('\n== 5. 排序 ==')
// ============================================================
const byStars = sortRepos(REPOS, 'stars_desc')
check(
  'stars_desc 按星标数降序',
  names(byStars) === 'a/old-but-many-stars,d/invalid-date,e/middle-band,f/language-named-unknown,b/newest-star,c/middle',
  names(byStars)
)
check('stars_desc 的星标数确实单调不增', isSorted(byStars.map((r) => r.stargazers_count)))
// 稳定性：b 与 c 都是 10 星，必须保持入参顺序（b 在 c 前），不能随机翻面
check(
  'stars_desc 同分时保持入参顺序（稳定排序）',
  byStars
    .filter((r) => r.stargazers_count === 10)
    .map((r) => r.full_name)
    .join(',') === 'b/newest-star,c/middle'
)

const byPushed = sortRepos(REPOS, 'pushed_desc')
check(
  'pushed_desc 按推送时间降序，无时间的排最后',
  names(byPushed) === 'd/invalid-date,b/newest-star,e/middle-band,f/language-named-unknown,a/old-but-many-stars,c/middle',
  names(byPushed)
)
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
  names(byName) === 'a/old-but-many-stars,b/newest-star,c/middle,d/invalid-date,e/middle-band,f/language-named-unknown',
  names(byName)
)

const byStarred = sortRepos(REPOS, 'starred_desc')
check(
  'starred_desc 按收藏时间降序，解析不出来的排最后',
  names(byStarred) === 'b/newest-star,e/middle-band,f/language-named-unknown,c/middle,a/old-but-many-stars,d/invalid-date',
  names(byStarred)
)
check('starred_desc 把解析不出来的 starred_at 当作最旧', byStarred[byStarred.length - 1]!.full_name === 'd/invalid-date')
check(
  'starred_desc 的已知时间单调不增',
  isSorted(
    byStarred
      .map((r) => r.starred_at)
      .filter((s) => !Number.isNaN(Date.parse(s)))
      .map((s) => Date.parse(s))
  )
)
// 「加排序不等于改了默认观感」：GitHub 的 /user/starred 本就按 starred_at 倒序返回，
// 所以对一个已经是该顺序的输入，默认排序应当原样返回。
const alreadyStarredDesc = [
  makeRepo({ full_name: 'p', starred_at: daysAgo(1) }),
  makeRepo({ full_name: 'q', starred_at: daysAgo(2) }),
  makeRepo({ full_name: 'r', starred_at: daysAgo(3) })
]
check('默认排序对「已经是最近收藏序」的输入是恒等变换', names(sortRepos(alreadyStarredDesc, 'starred_desc')) === 'p,q,r')

// —— 不修改入参：repos 数组直接来自 zustand store，原地 sort 会改掉 store 的顺序，
//    而那顺序同时被周报 / 总览 / 推荐当作"收藏先后"在用 ——
const originalOrder = names(REPOS)
for (const sort of ALL_SORTS) sortRepos(REPOS, sort)
check('sortRepos 不修改入参数组', names(REPOS) === originalOrder, names(REPOS))
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
  names(sortRepos(twoNull, 'pushed_desc')) === 'x/no-time,y/no-time'
)
const twoBad = [
  makeRepo({ full_name: 'x/bad', pushed_at: '???' }),
  makeRepo({ full_name: 'y/bad', pushed_at: '???' })
]
check(
  '两个仓库的 pushed_at 都解析失败时保持原顺序',
  names(sortRepos(twoBad, 'pushed_desc')) === 'x/bad,y/bad'
)

// ============================================================
console.log('\n== 6. selectRepos：筛选与排序的组合 ==')
// ============================================================
check(
  '先筛后排，只对筛出来的结果排序',
  names(selectRepos(REPOS, F({ language: languageOption('TypeScript'), sort: 'name_asc' }), NOW)) ===
    'b/newest-star,c/middle'
)
check(
  '筛掉之后排序仍然生效（不因为子集小就不排）',
  names(selectRepos(REPOS, F({ sort: 'stars_desc' }), NOW)) === names(sortRepos(filterRepos(REPOS, F(), NOW), 'stars_desc'))
)
check('筛选可筛空，且不抛错', selectRepos(REPOS, F({ keyword: 'zzz', sort: 'pushed_desc' }), NOW).length === 0)
check(
  '改排序不影响筛选结果集合',
  ALL_SORTS.every(
    (s) =>
      new Set(selectRepos(REPOS, F({ language: languageOption('TypeScript'), sort: s }), NOW).map((r) => r.full_name))
        .size === 2
  )
)
check(
  '语言 + 活跃度 + 排序三者叠加',
  names(selectRepos(REPOS, F({ language: languageOption('TypeScript'), health: 'active', sort: 'stars_desc' }), NOW)) ===
    'b/newest-star' &&
    selectRepos(REPOS, F({ language: languageOption('TypeScript'), health: 'stale' }), NOW).length === 0
)
check('selectRepos 也不修改入参', names(REPOS) === originalOrder)

// ============================================================
console.log('\n== 7. 下钻（filtersFor）：必须整份替换，不能合并 ==')
// ============================================================
// 总览页点统计卡 → 收藏管理页。卡片上写着 12，点进去就必须看到 12 条。
// 如果下钻是往"用户当前的条件"上合并，而用户上次留了个搜索词，
// 点进去就只剩 3 条——数字对不上，页面上还看不出为什么。
check('空 patch 得到的就是默认筛选器', JSON.stringify(filtersFor()) === JSON.stringify(DEFAULT_FILTERS))
check(
  '下钻只覆盖指定的那一项，其余全回默认',
  (() => {
    const f = filtersFor({ health: 'stale' })
    return (
      f.health === 'stale' &&
      f.keyword === DEFAULT_FILTERS.keyword &&
      f.language === DEFAULT_FILTERS.language &&
      f.category === DEFAULT_FILTERS.category &&
      f.onlyCloned === DEFAULT_FILTERS.onlyCloned &&
      f.sort === DEFAULT_FILTERS.sort
    )
  })()
)
check(
  '下钻"已 Clone"只剩 onlyCloned，不带任何关键词',
  (() => {
    const f = filtersFor({ onlyCloned: true })
    return f.onlyCloned === true && f.keyword === '' && f.language === 'all' && f.health === 'all'
  })()
)
check(
  '下钻语言 / 分类用的是 languageOption 与真分类',
  filtersFor({ language: languageOption('Rust') }).language === 'name:Rust' &&
    names(selectRepos(REPOS, filtersFor({ language: languageOption('Rust') }), NOW)) === 'a/old-but-many-stars' &&
    names(selectRepos(REPOS, filtersFor({ category: '前端' }), NOW)) === 'b/newest-star'
)
// 下钻的筛选器必须真的等于「总览卡片上的那个数字」——这是整条链路的落点
check(
  '下钻 health:stale 筛出的条数 == 卡片上的 stale 数字',
  selectRepos(REPOS, filtersFor({ health: 'stale' }), NOW).length ===
    computeCollectionStats(REPOS, NOW).stale
)
check(
  '下钻 onlyCloned 筛出的条数 == 卡片上的 cloned 数字',
  selectRepos(REPOS, filtersFor({ onlyCloned: true }), NOW).length ===
    computeCollectionStats(REPOS, NOW).cloned
)
check(
  'filtersFor 不修改 DEFAULT_FILTERS（两个下钻不会互相污染）',
  (() => {
    filtersFor({ health: 'stale', keyword: 'x' })
    return DEFAULT_FILTERS.health === 'all' && DEFAULT_FILTERS.keyword === ''
  })()
)

// ============================================================
console.log('\n== 8. 分类筛选的三态（全部分类 / 真分类 / 未分类）==')
// ============================================================
// 「未分类」这个态以前表达不出来：category 的类型是 `AiCategory | null`，
// 而 null 早被约定成"全部分类"了。于是总览页那句「还有 N 个未分类」——整页
// 最可行动的一个数字——没有任何去处。
check('category 为 all 时不过滤', vis({ category: 'all' }).length === REPOS.length)

// 两个保留值都不能是某个真分类。AiCategory 是封闭枚举，这条能直接查出来；
// 万一将来有人往 AI_CATEGORIES 里加了 'all'，这里立刻红。
check(
  'all / uncategorized 都不在 AI_CATEGORIES 里',
  !(AI_CATEGORIES as readonly string[]).includes('all') &&
    !(AI_CATEGORIES as readonly string[]).includes('uncategorized'),
  AI_CATEGORIES.join(',')
)
check(
  'isRealCategory 不认这两个保留值',
  !isRealCategory('all') && !isRealCategory('uncategorized')
)

check(
  'uncategorized 只取没有 ai_category 的',
  names(vis({ category: 'uncategorized' })) === 'c/middle,d/invalid-date',
  names(vis({ category: 'uncategorized' }))
)
check(
  '真分类筛选不受三态改动影响',
  names(vis({ category: '工具' })) === 'a/old-but-many-stars' &&
    names(vis({ category: '前端' })) === 'b/newest-star' &&
    names(vis({ category: '后端' })) === 'e/middle-band' &&
    names(vis({ category: '其他' })) === 'f/language-named-unknown'
)

// 三态必须构成划分：真分类们 + 未分类 = 全部，且两两不重叠。
// 少给一个状态的话（比如把"未分类"忘了），这里会露馅。
check(
  '7 个真分类 + 未分类 = 全部（三态构成划分）',
  AI_CATEGORIES.reduce<number>((n, c) => n + vis({ category: c }).length, 0) +
    vis({ category: 'uncategorized' }).length ===
    REPOS.length
)
check(
  '未分类与任何真分类都不重叠',
  AI_CATEGORIES.every((c) =>
    vis({ category: c }).every((r) => r.full_name !== 'c/middle' && r.full_name !== 'd/invalid-date')
  )
)

// —— 本轮最重要的一条：这个筛选态存在的理由就是那个数字 ——
// 总览页「还有 N 个未分类」，点进去必须恰好是 N 条。判据两边同源
// （collectionStats 里数 `if (r.ai_category)`），这条断言把同源这件事锁住。
const stats8 = computeCollectionStats(REPOS, NOW)
check(
  '下钻 uncategorized 筛出的条数 == 卡片上的 uncategorized 数字',
  selectRepos(REPOS, filtersFor({ category: 'uncategorized' }), NOW).length === stats8.uncategorized,
  `${selectRepos(REPOS, filtersFor({ category: 'uncategorized' }), NOW).length} vs ${stats8.uncategorized}`
)
check(
  '未分类 + 已分类 = 总数（与 categorized 口径一致）',
  stats8.uncategorized + stats8.categorized === stats8.total &&
    vis({ category: 'uncategorized' }).length === stats8.uncategorized
)
// 桶名与筛选态是两个不同的字符串，页面靠 UNCATEGORIZED_LABEL 做映射。
// 这里守住"桶确实叫这个名字"，否则总览页那一行会变成不可点。
check(
  '分类分布里未分类桶的名字就是 UNCATEGORIZED_LABEL',
  stats8.categories.some((b) => b.name === UNCATEGORIZED_LABEL) &&
    !isRealCategory(UNCATEGORIZED_LABEL),
  stats8.categories.map((b) => b.name).join(',')
)
check(
  '未分类桶的计数就是 uncategorized',
  stats8.categories.find((b) => b.name === UNCATEGORIZED_LABEL)?.count === stats8.uncategorized
)

check(
  '下钻未分类只带 category，其余回默认',
  (() => {
    const f = filtersFor({ category: 'uncategorized' })
    return (
      f.category === 'uncategorized' &&
      f.keyword === '' &&
      f.language === 'all' &&
      f.onlyCloned === false &&
      f.health === 'all' &&
      f.sort === DEFAULT_FILTERS.sort
    )
  })()
)

// ============================================================
console.log('\n== 9. 语言下拉的候选项 ==')
// ============================================================
// 原生 <select> 的 value 在 option 里找不到匹配项时会变成"没有选中项"——
// 界面一片空白，而 store 里那个筛选还在生效。用户看到一个空列表，看不出原因。
// 所以候选项必须**无条件**包含当前选中的语言。
const langRepos = [
  makeRepo({ full_name: 'l/ts', language: 'TypeScript' }),
  makeRepo({ full_name: 'l/go', language: 'Go' }),
  makeRepo({ full_name: 'l/ts2', language: 'TypeScript' }),
  makeRepo({ full_name: 'l/none', language: null })
]

check(
  '语言候选去重且按名字排序',
  languageOptions(langRepos, 'all').join(',') === 'Go,TypeScript',
  languageOptions(langRepos, 'all').join(',')
)
check(
  'language 为 null 的仓库不产生候选项',
  !languageOptions(langRepos, 'all').includes('') &&
    !languageOptions(langRepos, 'all').some((l) => l.trim() === '')
)
// —— 这一节的重点 ——
const withoutGo = langRepos.filter((r) => r.language !== 'Go')
check(
  '选中的语言即使已经不在收藏里也留在候选里',
  languageOptions(withoutGo, languageOption('Go')).includes('Go'),
  languageOptions(withoutGo, languageOption('Go')).join(',')
)
check(
  '空列表 + 具体语言，候选里仍然有它',
  languageOptions([], languageOption('Rust')).join(',') === 'Rust'
)
check('空列表 + 全部语言，候选为空', languageOptions([], 'all').length === 0)
check('空列表 + 未知语言，候选为空', languageOptions([], 'unknown').length === 0)

// 保留态不能混进候选：languageNameOf 对 'all'/'unknown' 返回 null，
// 否则下拉里会多出一个叫 "all" 的语言选项，和保留字撞成同一个 value。
check(
  '保留态不会变成候选项',
  !languageOptions(langRepos, 'all').includes('all') &&
    !languageOptions(langRepos, 'unknown').includes('unknown')
)
check(
  '选中的语言大小写/内容原样保留，不做归一化',
  languageOptions([], languageOption('C++')).join(',') === 'C++'
)
// 真有个语言叫 "unknown" 时，它是以 name:unknown 的形态出现的——与保留态
// 'unknown'（未知语言）是两个不同的 option value，这一点在自检第 3 节已经验过；
// 这里确认候选项本身不会把两者搞混。
const withUnknownLang = [makeRepo({ full_name: 'l/u', language: 'unknown' })]
check(
  '语言名就叫 unknown 的仓库会作为候选出现',
  languageOptions(withUnknownLang, 'all').join(',') === 'unknown' &&
    languageOption(languageOptions(withUnknownLang, 'all')[0]!) === 'name:unknown'
)

console.log(`\n== 结果：${failures === 0 ? '全部通过' : `${failures} 项失败`} ==`)
process.exit(failures === 0 ? 0 : 1)