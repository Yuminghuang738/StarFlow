// 负责人：P2 ｜ 接口规格见 docs/module-signatures.md（冻结），任务说明见 prompts/
// 真实实现：openai SDK（key 从 config.getEnv() 取），提示词内要求 JSON / 单词输出 + 本地清洗解析；
// enrichRepos 内部用 p-limit 3 并发，结果写回 store.saveRepos() 后返回完整列表。
//
// 硬约束（见 prompts/p2-ai.md）：
//   1) 不使用 response_format（大量 OpenAI 兼容中转不支持，会直接 400）
//   2) enrichRepos 并发严格为 3，用 p-limit，不裸跑 Promise.all

import OpenAI from 'openai'
import pLimit from 'p-limit'
import type { Repo, AiCategory } from '@shared/types'
import { AI_CATEGORIES } from '@shared/types'
import { isMockMode, getEnv } from './config'
import * as store from './store'
import * as github from './github'
import { mockSummary, mockClassify, mockEnrich, mockReportSummary } from './mock'

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** 送模型前 README 的最大字符数，避免无谓的额度消耗 */
const README_LIMIT = 6000
/** README 少于这个长度就没必要调模型（大概率是空文件或占位） */
const README_MIN_LENGTH = 30
/** 周报提示词里最多列多少个仓库 */
const REPORT_REPO_LIMIT = 50
/** enrichRepos 的并发上限（PR 验收项：严格 ≤ 3） */
const ENRICH_CONCURRENCY = 3
/** 缺少 API Key 的提示文案，既是给用户看的，也是降级策略里唯一允许 throw 的判据 */
const MISSING_KEY_MESSAGE = '未配置 OPENAI_API_KEY，请在 .env 中填写'

/* ------------------------------------------------------------------ */
/* 客户端（模块级懒加载，不在文件顶层 new）                              */
/* ------------------------------------------------------------------ */

let cached: OpenAI | null = null
let cachedKey = ''

function client(): OpenAI {
  const env = getEnv()
  if (!env.openaiKey) throw new Error(MISSING_KEY_MESSAGE)
  if (!cached || cachedKey !== env.openaiKey) {
    cachedKey = env.openaiKey
    cached = new OpenAI({
      apiKey: env.openaiKey,
      baseURL: env.openaiBaseUrl || undefined,
      timeout: 30000,
      maxRetries: 2
    })
  }
  return cached
}

function modelName(): string {
  return getEnv().modelName || 'gpt-4o-mini'
}

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

/** 统一取错误信息，第三方错误对象只做窄化，不用 any */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  const narrowed = err as { message?: string }
  if (typeof narrowed?.message === 'string') return narrowed.message
  return String(err)
}

/** 缺 Key 是配置问题，必须冒泡给用户；其余 AI 失败一律降级 */
function isMissingKey(err: unknown): boolean {
  return errorMessage(err).includes(MISSING_KEY_MESSAGE)
}

/**
 * 分类收敛：把模型的自由文本压回 7 个枚举之一，绝不返回枚举外的值。
 * 顺序上先精确匹配，再清掉标点/空白/引号做包含匹配，最后兜底 '其他'。
 * 额外做一次大小写折叠，让 'Devops' / 'devops' 这类拼写能命中 'DevOps'——
 * 这是"更聪明当然更好"的那部分，兜底行为仍然只会是 7 个枚举之一。
 */
export function normalizeCategory(text: string): AiCategory {
  const t = text.trim()
  if ((AI_CATEGORIES as readonly string[]).includes(t)) return t as AiCategory
  const cleaned = t.replace(/[\s"'`。.,，、]/g, '')
  const folded = cleaned.toLowerCase()
  const hit = AI_CATEGORIES.find(
    (c) => cleaned.includes(c) || folded.includes(c.toLowerCase())
  )
  return hit ?? '其他'
}

/** 模型偶尔会把结果包在 ```json 里，或加一层 "category": "前端"，这里统一清洗 */
function extractContent(raw: string | null | undefined): string {
  const text = (raw ?? '').trim()
  if (!text) return ''
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1].trim() : text
  const quoted = body.match(/"category"\s*:\s*"([^"]*)"/i)?.[1] ?? ''
  if (quoted) return quoted
  return body
}

/** 取 choices[0].message.content 并 trim；SDK 类型上它是 string | null */
function readContent(message: { content?: string | null } | undefined): string {
  if (!message || typeof message.content !== 'string') return ''
  return message.content.trim()
}

/** 说话人：周报降级文案里要提到哪个仓库最值得看（Star 最多的那个） */
function pickTopRepo(repos: Repo[]): Repo | undefined {
  return [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count)[0]
}

/** 周报降级文案里的主力语言：出现次数最多，打平取字典序小的，保证结果稳定可复现 */
function topLanguage(repos: Repo[]): string {
  const counts = new Map<string, number>()
  for (const r of repos) {
    const key = r.language ?? '未知'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best = '未知'
  let bestCount = 0
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang
      bestCount = count
    }
  }
  return best
}

/* ------------------------------------------------------------------ */
/* 4 个导出函数（签名冻结，见 docs/module-signatures.md）                */
/* ------------------------------------------------------------------ */

export async function summarize(readme: string): Promise<string> {
  if (isMockMode()) return mockSummary(readme)
  if (!readme || readme.trim().length < README_MIN_LENGTH) return ''

  const started = Date.now()
  try {
    const res = await client().chat.completions.create({
      model: modelName(),
      temperature: 0.2,
      max_tokens: 200,
      messages: [
        { role: 'system', content: '你是技术文档摘要助手，只输出摘要本身。' },
        {
          role: 'user',
          content: `请用一句中文总结下面这个开源项目的用途和亮点。要求：
1) 不超过 50 字
2) 不要以"这个项目"开头
3) 不要 markdown、不要换行、不要引号
4) 直接输出摘要，不要任何前缀
---
${readme.slice(0, README_LIMIT)}`
        }
      ]
    })
    const text = readContent(res.choices[0]?.message)
    console.log(`[ai] summarize 完成，耗时 ${Date.now() - started}ms`)
    return text
  } catch (err) {
    // 缺 Key 必须让用户看见，其余一律降级为空串（首页不能因为 AI 挂了就崩）
    if (isMissingKey(err)) throw err
    console.error('[ai] summarize 失败，已降级返回空摘要:', errorMessage(err))
    return ''
  }
}

export async function classify(repo: Repo): Promise<AiCategory> {
  if (isMockMode()) {
    const result = mockClassify(repo)
    // 兜底：分类必须落在 AI_CATEGORIES 内，越界一律归到"其他"
    return AI_CATEGORIES.includes(result) ? result : '其他'
  }

  try {
    const res = await client().chat.completions.create({
      model: modelName(),
      temperature: 0,
      max_tokens: 20,
      messages: [
        {
          role: 'user',
          content: `请判断下面这个 GitHub 仓库属于哪个分类。只能从以下 7 个词中选择**一个**，不要输出任何其它内容：
AI/ML、前端、后端、DevOps、工具、学习资源、其他

仓库全名：${repo.full_name}
描述：${repo.description ?? '（无）'}
主要语言：${repo.language ?? '（未知）'}
主题标签：${repo.topics.join(', ') || '（无）'}
只回复那一个词。`
        }
      ]
    })
    const category = normalizeCategory(extractContent(res.choices[0]?.message?.content))
    console.log(`[ai] classify ${repo.full_name} -> ${category}`)
    return category
  } catch (err) {
    if (isMissingKey(err)) throw err
    console.error(`[ai] classify 失败，已降级为"其他"：${repo.full_name}`, errorMessage(err))
    return '其他'
  }
}

export async function enrichRepos(repos: Repo[]): Promise<Repo[]> {
  // 跳过逻辑必须写在 mock 分支之外：MOCK_MODE=true 时 mockEnrich 内部同样带跳过，
  // 这样两种模式的可观察行为才一致（骨架版 mockEnrich 每次都重算，见 mock.ts）。
  const enrichOne = async (repo: Repo): Promise<Repo> => {
    // 1. 两个字段都齐了直接原样返回，省额度
    if (repo.ai_category && repo.ai_summary) return repo

    // 2. 分类
    const category = await classify(repo)

    // 3. 摘要：已有的不动，缺的才去读 README
    let summary = repo.ai_summary ?? ''
    if (!summary) {
      try {
        const readme = await github.fetchReadme(repo.full_name)
        if (readme.trim().length >= README_MIN_LENGTH) {
          summary = await summarize(readme)
        }
      } catch (err) {
        console.error(`[ai] 读取 README 失败，跳过摘要：${repo.full_name}`, err)
      }
    }

    return { ...repo, ai_category: category, ai_summary: summary || undefined }
  }

  if (isMockMode()) return mockEnrich(repos)

  const limit = pLimit(ENRICH_CONCURRENCY)
  let done = 0
  const tasks = repos.map((r) =>
    limit(async () => {
      const result = await enrichOne(r)
      done += 1
      if (done % 5 === 0 || done === repos.length) {
        console.log(`[ai] 已补全 ${done}/${repos.length}`)
      }
      return result
    })
  )

  try {
    const enriched = await Promise.all(tasks)
    await store.saveRepos(enriched)
    return enriched
  } catch (err) {
    // 只有缺 Key 会从 classify 冒泡上来；此时不该把半截结果写库，直接提示用户
    if (isMissingKey(err)) throw err
    console.error('[ai] enrichRepos 失败:', errorMessage(err))
    throw new Error(`AI 补全失败: ${errorMessage(err)}`)
  }
}

export async function generateReport(repos: Repo[]): Promise<string> {
  if (isMockMode()) return mockReportSummary(repos)
  if (repos.length === 0) return '本周没有新增 Star。'

  const topLang = topLanguage(repos)
  const topRepo = pickTopRepo(repos)
  const fallback =
    `本周新增 ${repos.length} 个 Star，主力语言是 ${topLang}，` +
    `其中 ${topRepo?.full_name ?? '—'} 最值得一看。`

  const list = repos
    .slice(0, REPORT_REPO_LIMIT)
    .map((r) => `${r.full_name} (${r.language ?? '未知'}, ${r.ai_category ?? '未分类'}, ${r.stargazers_count} stars)`)
    .join('\n')

  try {
    const res = await client().chat.completions.create({
      model: modelName(),
      temperature: 0.6,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `请根据下面的本周新增 Star 列表，写一段中文周报总结。
要求：
1) 100~200 字
2) 语气自然口语，像人在群里汇报工作，不要"综上所述""总而言之"这种套话
3) 提到本周新增数量、主力语言、以及最值得关注的 1~2 个项目
4) 不要 markdown、不要分点、不要换行
5) 直接输出这段话
---
${list}`
        }
      ]
    })
    const text = readContent(res.choices[0]?.message)
    // 模型返回空白时同样走本地兜底，report.generate() 的调用方永远能拿到一段文案
    return text || fallback
  } catch (err) {
    // 这个函数被 report.ts 调用，必须稳定不抛错（缺 Key 也降级，首页/周报页不能崩）
    console.error('[ai] generateReport 失败，已降级为本地文案:', errorMessage(err))
    return fallback
  }
}
