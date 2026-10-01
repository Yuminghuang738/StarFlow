// 接口规格见 docs/module-signatures.md（冻结）
//
// PR 4：真实模式的「猜你喜欢」与「一句话找仓库」。
//   - similar(fullName)：只用**本地已有语料**的信号（topics / language / ai_category）
//     加一个星数地板，**不调 AI**。猜你喜欢只要有 GitHub Token 就能用，比调 AI 便宜、稳。
//   - forQuery(query)：AI 出结构化计划（可选）→ 主进程确定性拼查询串 → 搜索 →
//     过滤掉已经 Star 的。AI 没配就退回原句搜索，功能照常。
//   - forYou(offset)：把**整份收藏**压成画像，再按画像拼几条查询去搜。
//     similar() 仍然保留（它是已公开的通道，删掉就是破坏契约），但界面上不再用它当主路径——
//     要求用户先挑一个种子，等于把「我喜欢什么」这个问题又推回给用户。

import type { Repo, AiCategory } from '@shared/types'
import type { RecommendForYou, RecommendProfile } from '@shared/recommend'
import { isMockMode } from './config'
import { mockRecommendForYou, mockSimilar } from './mock'
import * as github from './github'
import * as ai from './ai'
import * as store from './store'
import type { SearchPlan } from './ai-prompts'

/** 相似推荐返回条数 */
const SIMILAR_LIMIT = 6
/** 星数地板：太低会搜出一堆练手仓库，太高会把小语种的相似项目全滤掉 */
const MIN_STARS_FLOOR = 50
/** topics 最多取几个做 topic: 限定——限定越多，"相似"越容易变成 0 结果 */
const MAX_TOPIC_TERMS = 2
/** 相似推荐会先多取一些再过滤掉自己与语料里已有的，所以请求数大于返回数 */
const SIMILAR_FETCH = SIMILAR_LIMIT * 2

/** 「为你推荐」一次最多跑几条搜索。GitHub 搜索接口限频很紧（认证后 30 次/分钟），
 *  串行 3 条是上限——用户在页面上点两次「换一批」就会用掉 6 次 */
const FOR_YOU_QUERIES = 3
/** 返回条数。比 similar 给得多：这是整份收藏推出来的，值得多铺一些 */
const FOR_YOU_LIMIT = 12
/** 每条查询多取一些，合并去重 + 滤掉已 Star 之后还有富余 */
const FOR_YOU_FETCH = 20
/** 画像里保留的语言 / 主题数量。语言要用来拼限定符，主题是画像的主体 */
const PROFILE_LANGS = 3
const PROFILE_TOPICS = 5
/** 星数地板的上限：收藏里全是几万星的大项目时，地板也不能高到把结果全滤空 */
const MAX_STARS_FLOOR = 5000

/** 仓库自己没有 topics 时，按 AI 分类退到一个通用 topic */
const CATEGORY_TOPIC: Record<AiCategory, string | null> = {
  'AI/ML': 'machine-learning',
  前端: 'frontend',
  后端: 'backend',
  DevOps: 'devops',
  工具: 'cli',
  学习资源: 'awesome-list',
  其他: null
}

/**
 * 清洗要拼进 GitHub 限定符的值。
 *
 * 这是让「AI 出计划」这套方案**安全**的关键护栏：值里一旦出现 `:`、引号、逗号、
 * 括号或换行，GitHub 会把它当成新的限定符或者直接判语法错误——轻则 0 结果、
 * 重则 422，而且报错指向的是拼好的 q，用户根本看不懂。这里一律剥掉，
 * 保证拼出来的查询串永远是合法的。
 *
 * 另外它顺手给纯原句查询（AI 未配置时的退路）当白名单：用户输入什么都进不了语法层。
 */
export function escapeQualifier(value: string): string {
  return value
    .replace(/[:"',()\[\]{}\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 把结构化计划（可能为 null = AI 没配或没解析出来）拼成 GitHub 查询串。
 * 纯函数，便于自检脚本直接断言。
 */
export function buildQuery(plan: SearchPlan | null, rawQuery: string): string {
  const parts: string[] = [escapeQualifier(plan?.keywords || rawQuery)]

  const language = escapeQualifier(plan?.language ?? '')
  if (language) parts.push(`language:${language}`)

  const topic = escapeQualifier(plan?.topic ?? '')
  if (topic) parts.push(`topic:${topic}`)

  if (plan?.minStars) parts.push(`stars:>=${plan.minStars}`)

  // 全部被清洗成空串时返回空——github.searchRepos 收到空串会直接返回 []，
  // 不会把一条空查询发给 GitHub
  return parts.filter((p) => p !== '').join(' ')
}

export async function similar(fullName: string): Promise<Repo[]> {
  if (isMockMode()) return mockSimilar(fullName)

  const corpus = await store.getRepos()
  const self = corpus.find((r) => r.full_name === fullName)
  if (!self) throw new Error(`本地列表里没有 ${fullName}，先同步一次 Star 列表再试`)

  const parts: string[] = []

  // 相似度最可靠的信号是 topics；取前两个就够了，全塞进去会把结果限死
  const topics = self.topics
    .map(escapeQualifier)
    .filter((t) => t !== '')
    .slice(0, MAX_TOPIC_TERMS)
  for (const t of topics) parts.push(`topic:${t}`)

  const language = escapeQualifier(self.language ?? '')
  if (language) parts.push(`language:${language}`)

  // 没有 topics 才退到分类映射；两者都缺时就只剩语言 + 星数地板
  if (topics.length === 0) {
    const fallback = CATEGORY_TOPIC[self.ai_category ?? '其他']
    if (fallback) parts.push(`topic:${fallback}`)
  }

  // 热度地板：按自己星数的 10% 取，和 MIN_STARS_FLOOR 取大者。
  // 这一步是防噪音的关键——纯 topic 查询会把刚建的空仓库也带出来。
  const starFloor = Math.max(MIN_STARS_FLOOR, Math.floor(self.stargazers_count * 0.1))
  parts.push(`stars:>=${starFloor}`)

  const found = await github.searchRepos(parts.join(' '), SIMILAR_FETCH)
  // 排除自己（corpus 含自身）和语料里已有的仓库：推荐已经 Star 过的东西没有意义
  const known = new Set(corpus.map((r) => r.full_name))
  return found.filter((r) => !known.has(r.full_name)).slice(0, SIMILAR_LIMIT)
}

/**
 * 把整份收藏压成画像。纯函数，自检可以直接喂语料断言。
 *
 * 星数地板取**收藏中位数**的 20%，而不是一个拍脑袋的常数：
 * 收藏里全是几万星的大项目时，地板 50 会搜出一堆刚建的空仓库；
 * 反过来收藏都是小工具的话，地板取高了又会把结果滤空。
 * 上下限都要卡：下限保底去噪，上限防止大项目玩家被滤到一条不剩。
 */
export function buildProfile(corpus: Repo[]): RecommendProfile {
  const langCounts = new Map<string, number>()
  const topicCounts = new Map<string, number>()
  const catCounts = new Map<string, number>()
  const stars: number[] = []

  for (const r of corpus) {
    if (r.language) bump(langCounts, r.language)
    for (const t of r.topics) bump(topicCounts, t)
    if (r.ai_category) bump(catCounts, r.ai_category)
    stars.push(r.stargazers_count)
  }

  stars.sort((a, b) => a - b)
  const median = stars.length === 0 ? 0 : stars[Math.floor(stars.length / 2)]
  const starFloor = Math.min(
    MAX_STARS_FLOOR,
    Math.max(MIN_STARS_FLOOR, Math.floor(median * 0.2))
  )

  return {
    total: corpus.length,
    languages: rank(langCounts, PROFILE_LANGS),
    topics: rank(topicCounts, PROFILE_TOPICS),
    category: (rank(catCounts, 1)[0] as AiCategory | undefined) ?? null,
    starFloor
  }
}

/** 计数 → 降序排名。同数打平按字典序，保证同一份语料排出同一个画像 */
function rank(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name)
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/** 把数组按 offset 循环左移，让「换一批」能换到画像后面几位的语言/主题 */
function rotate(items: string[], offset: number): string[] {
  if (items.length === 0) return items
  const k = ((offset % items.length) + items.length) % items.length
  return [...items.slice(k), ...items.slice(0, k)]
}

/**
 * 画像 → 搜索查询串。最多 FOR_YOU_QUERIES 条，纯函数，便于自检断言。
 *
 * 三条的分工是刻意的：
 *   ① 最强主题 + 主力语言 —— 最像「你平时收藏的那一类」；
 *   ② 第二主题、**不限语言** —— 收藏往往跨语言，锁死语言会漏掉同类项目；
 *   ③ 第三主题 + 次语言；主题不够就退到分类，再不够退到纯语言。
 * 最后两条兜底是为了「一条 topic 都没有」的收藏（很多人压根没给仓库打过标签），
 * 那种情况下至少还能按语言推。
 *
 * 所有值都过 escapeQualifier：它剥掉 : " , ( ) 换行，保证拼出来的查询串永远合法
 * （见该函数的说明——一个没洗过的 topic 就能让 GitHub 返回 422）。
 */
export function buildForYouQueries(profile: RecommendProfile, offset = 0): string[] {
  const langs = rotate(profile.languages, offset)
  const topics = rotate(profile.topics, offset).map(escapeQualifier).filter((t) => t !== '')
  const catTopic = profile.category ? CATEGORY_TOPIC[profile.category] : null
  const floor = `stars:>=${profile.starFloor}`

  const out: string[] = []
  const push = (parts: (string | null)[]): void => {
    const kept = parts.filter((p): p is string => p !== null && p !== '')
    // 只剩星数地板的查询 = 「全站最热」，那不是推荐，是噪音，直接丢掉。
    // （画像里一条 topic 都没有时，第 ② 条会退化成这样。）
    if (!kept.some((p) => p !== floor)) return
    const q = kept.join(' ')
    // 去重：语料小时「换一批」很可能拼出和上一轮一样的串，重复搜纯属白耗配额
    if (!out.includes(q)) out.push(q)
  }

  const lang = (i: number): string | null =>
    langs[i] ? `language:${escapeQualifier(langs[i])}` : null

  push([topics[0] ? `topic:${topics[0]}` : null, lang(0), floor])
  push([topics[1] ? `topic:${topics[1]}` : null, floor])
  push([
    topics[2] ? `topic:${topics[2]}` : catTopic ? `topic:${catTopic}` : null,
    lang(1),
    floor
  ])
  // 兜底：上面能拼出来的不足 3 条时，用分类 / 纯语言补上
  if (out.length < FOR_YOU_QUERIES) push([catTopic ? `topic:${catTopic}` : null, lang(0), floor])
  if (out.length < FOR_YOU_QUERIES) push([lang(0), floor])

  return out.slice(0, FOR_YOU_QUERIES)
}

/**
 * 「为你推荐」：不要求用户挑种子，直接把整份收藏推成几条查询。
 *
 * 用**本地语料**画像而不调 AI：和 similar() 同一条理由——只要有 Token 就能用，
 * 比调 AI 便宜、稳，还不会因为模型自由发挥搜出跑题的东西。
 *
 * offset 是「换一批」的位移，用来错开画像里排后面的语言与主题。
 */
export async function forYou(offset = 0): Promise<RecommendForYou> {
  const corpus = await store.getRepos()
  const profile = buildProfile(corpus)
  if (isMockMode()) return { items: mockRecommendForYou(corpus), profile }

  const queries = buildForYouQueries(profile, offset)
  const known = new Set(corpus.map((r) => r.full_name))
  // full_name → 命中了几条查询。命中越多说明越贴合画像，这就是排序依据
  const hits = new Map<string, { repo: Repo; n: number }>()

  // ⚠️ 串行而不是 Promise.all：GitHub 搜索接口认证后也只有 30 次/分钟，
  // 3 条并发打过去，用户连点两次「换一批」就会撞 403，而那看起来像功能坏了。
  for (const q of queries) {
    const found = await github.searchRepos(q, FOR_YOU_FETCH)
    for (const r of found) {
      if (known.has(r.full_name)) continue
      const hit = hits.get(r.full_name)
      if (hit) hit.n += 1
      else hits.set(r.full_name, { repo: r, n: 1 })
    }
  }

  const items = [...hits.values()]
    .sort((a, b) => b.n - a.n || b.repo.stargazers_count - a.repo.stargazers_count)
    .slice(0, FOR_YOU_LIMIT)
    .map((h) => h.repo)

  return { items, profile }
}

/**
 * 「一句话找仓库」。AI 只是**可选的**增强：
 * 有计划就按计划的限定符搜，没有（未配置 / 解析失败 / mock 模式）就用清洗过的原句搜。
 */
export async function forQuery(query: string): Promise<Repo[]> {
  const q = query.trim()
  if (!q) return []

  const plan = await ai.planSearch(q)
  const searchQuery = buildQuery(plan, q)

  const found = await github.searchRepos(searchQuery)
  // 已经 Star 过的不再推荐。只在**搜索这一刻**过滤：Star 之后不从结果里移除，
  // 让卡片就地翻成"已 Star"（移除的话"到底成没成"就没法回答了）。
  const starred = new Set((await store.getRepos()).map((r) => r.full_name))
  return found.filter((r) => !starred.has(r.full_name))
}
