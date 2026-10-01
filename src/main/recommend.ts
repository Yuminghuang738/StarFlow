// 接口规格见 docs/module-signatures.md（冻结）
//
// PR 4：真实模式的「猜你喜欢」与「一句话找仓库」。
//   - similar(fullName)：只用**本地已有语料**的信号（topics / language / ai_category）
//     加一个星数地板，**不调 AI**。猜你喜欢只要有 GitHub Token 就能用，比调 AI 便宜、稳。
//   - forQuery(query)：AI 出结构化计划（可选）→ 主进程确定性拼查询串 → 搜索 →
//     过滤掉已经 Star 的。AI 没配就退回原句搜索，功能照常。

import type { Repo, AiCategory } from '@shared/types'
import { isMockMode } from './config'
import { mockSimilar } from './mock'
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
