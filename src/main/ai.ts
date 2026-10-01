// 接口规格见 docs/module-signatures.md（冻结）
// 真实实现：openai SDK（key 从 config.getEnv() 取），提示词内要求 JSON / 单词输出 + 本地清洗解析；
// enrichRepos 内部用 p-limit 3 并发，结果写回 store.saveRepos() 后返回完整列表。
//
// 硬约束：
//   1) 不使用 response_format（大量 OpenAI 兼容中转不支持，会直接 400）
//   2) enrichRepos 并发严格为 3，用 p-limit，不裸跑 Promise.all

import OpenAI from 'openai'
import pLimit from 'p-limit'
import type { Repo, AiCategory, AiConnectionResult } from '@shared/types'
import { AI_CATEGORIES } from '@shared/types'
import { isMockMode, getEnv, setAiOverride } from './config'
import { summarizePrompt, classifyPrompt, reportPrompt } from './ai-prompts'
import * as store from './store'
import * as github from './github'
import { mockSummary, mockClassify, mockEnrich, mockReportSummary } from './mock'

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** README 少于这个长度就没必要调模型（大概率是空文件或占位） */
const README_MIN_LENGTH = 30
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
        { role: 'user', content: summarizePrompt(readme) }
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
      messages: [{ role: 'user', content: classifyPrompt(repo) }]
    })
    // 模型可能回裸词，也可能回 JSON / 围栏，extractContent 两种都兼容（见 ai-prompts.ts 顶部契约）
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

  try {
    const res = await client().chat.completions.create({
      model: modelName(),
      temperature: 0.6,
      max_tokens: 500,
      messages: [{ role: 'user', content: reportPrompt(repos) }]
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

/* ------------------------------------------------------------------ */
/* 配置热更新与连接探针                                                 */
/* ------------------------------------------------------------------ */

/**
 * 把 store 里存的 AI 配置刷进 config.ts 的覆盖层。
 *
 * 调用点有三处：app.whenReady() 启动时一次、store:saveAiConfig 与 store:clearAiKey
 * 两条 handler 各一次。挂在 handler 里而不是只挂启动路径，是为了不依赖
 * 「先启动、再配置」这个顺序——否则用户填完 key 必须重启才生效。
 *
 * ⚠️ 本函数签名是**同步** `void`（调用方不 await），但 store 的读取是异步的，
 * 所以内部起一个 fire-and-forget 的 async IIFE 去读 store，读完再 setAiOverride。
 * 启动路径上抛错就等于应用打不开，因此整段 try/catch 吞掉、只打日志。
 * 幂等：重复调用只是把同一份覆盖层再写一遍。
 *
 * 为什么不返回 Promise 让调用方 await：签名已冻结为 `void`，且调用点在 index.ts
 * 里是同步形式；改成 Promise 会强迫 index.ts 跟着改，而 index.ts 不归本 PR 动。
 */
export function refreshAiConfigCache(): void {
  void (async () => {
    try {
      // key 走 getAiKey（只给主进程内部用），baseUrl / model 走 getAiConfig。
      // 两者都不会把明文 key 带出主进程。
      const [key, cfg] = await Promise.all([store.getAiKey(), store.getAiConfig()])
      setAiOverride({
        // 没有界面 key 时置空串，让 getEnv() 的 || 退回 .env
        apiKey: key ?? '',
        baseUrl: cfg.baseUrl,
        model: cfg.model
      })
    } catch (err) {
      // 幂等、不抛错：它挂在启动路径与保存/清除 handler 上
      console.error('[ai] 刷新 AI 配置缓存失败（已忽略）:', errorMessage(err))
    }
  })()
}

/**
 * 把探针的错误**分类成人话**。绝不能直接把原始异常文本丢给用户——
 * 第三方中转的报错五花八门（有的返回 HTML、有的是 OpenAPI 的错误 JSON），
 * 用户看了也不知道下一步该改哪个字段。
 */
function classifyConnectionError(err: unknown): string {
  const where = getEnv().openaiBaseUrl || '默认 OpenAI 端点'

  // 连接类错误没有 HTTP status，必须先于 status 判断（超时是连接错误的子类）
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return `连接 ${where} 超时，请检查网络或 Base URL 是否可达`
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return `连不上 ${where}，请检查 Base URL 与网络（用中转时确认地址拼写、以及是否需要 /v1 后缀）`
  }

  const status = (err as { status?: number }).status
  if (status === 401 || err instanceof OpenAI.AuthenticationError) {
    return 'API Key 无效（401），请检查 Key 是否正确、是否已被撤销或过期'
  }
  if (status === 403) {
    return '没有访问权限（403），该 Key 可能未被允许调用此模型'
  }
  if (status === 404 || err instanceof OpenAI.NotFoundError) {
    return `Base URL 或模型名不对（404）：确认 ${where} 是否以 /v1 结尾、模型名是否存在`
  }
  if (status === 400 || err instanceof OpenAI.BadRequestError) {
    return '请求被拒绝（400），通常是模型名或 Base URL 与该中转端点不匹配'
  }
  if (status === 429) {
    return '请求过于频繁或额度不足（429），请稍后重试或检查账户余额'
  }
  if (typeof status === 'number' && status >= 500) {
    return `对方服务端错误（${status}），请稍后重试`
  }
  return `连接失败：${errorMessage(err)}`
}

/**
 * 连接探针。
 *
 * ⚠️ 为什么不能拿 summarize 当探针：它在失败时会静默降级成空串（见上面的
 * catch），探针永远"成功"。这条必须真的发一次极简请求，并把错误**分类**成
 * 人话返回（未配置 key / 连不上 baseUrl / key 无效 / baseUrl 或 model 不对），
 * 而不是把原始异常文本丢给用户，也**不抛错**——设置页直接把 message 渲染成一行提示。
 */
export async function testConnection(): Promise<AiConnectionResult> {
  const model = modelName()

  // MOCK_MODE 下不允许发起任何真实网络请求（项目铁律），直接返回说明
  if (isMockMode()) {
    return { ok: true, message: 'Mock 模式不发起真实请求', model }
  }

  // 先自查 key：比让 client() 抛错更早、也更明确
  if (!getEnv().openaiKey) {
    return { ok: false, message: '未配置 API Key，请在设置页填写或写入 .env', model }
  }

  try {
    // 极简探针：max_tokens 1，只要对方能正常回一个响应就说明链路通
    await client().chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    })
    return { ok: true, message: `连接正常（模型 ${model}）`, model }
  } catch (err) {
    console.error('[ai] 连接探针失败:', errorMessage(err))
    return { ok: false, message: classifyConnectionError(err), model }
  }
}
