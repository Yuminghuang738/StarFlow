// 接口规格见 docs/module-signatures.md（冻结）
// 真实实现：openai SDK（key 从 config.getEnv() 取），提示词内要求 JSON / 单词输出 + 本地清洗解析；
// enrichRepos 内部用 p-limit 3 并发，结果写回 store.saveRepos() 后返回完整列表。
//
// 端点不绑定 OpenAI 官方：任何 OpenAI 格式的端点都能用（DeepSeek / 智谱 / 通义 / 中转 /
// 本地 Ollama、LM Studio…），差异只在 Base URL、模型名、以及本地端点不需要 Key。
// 预设表与端点判定见 shared/ai-providers.ts。
//
// 硬约束：
//   1) 不使用 response_format（大量 OpenAI 兼容中转不支持，会直接 400）
//   2) enrichRepos 并发严格为 3，用 p-limit，不裸跑 Promise.all

import OpenAI from 'openai'
import pLimit from 'p-limit'
import type { Repo, AiCategory, AiConnectionResult, AiEnrichProgress } from '@shared/types'
import { AI_CATEGORIES } from '@shared/types'
import { isLocalEndpoint, type CollectionAnalysis } from '@shared/ai-providers'
import { isMockMode, getEnv, setAiOverride } from './config'
import {
  summarizePrompt,
  classifyPrompt,
  reportPrompt,
  collectionAnalysisPrompt,
  searchPlanPrompt,
  parseSearchPlan
} from './ai-prompts'
import type { SearchPlan, RepoRelease } from './ai-prompts'
import * as store from './store'
import * as github from './github'
import {
  mockSummary,
  mockClassify,
  mockEnrich,
  mockReportSummary,
  mockCollectionAnalysis
} from './mock'

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** README 少于这个长度就没必要调模型（大概率是空文件或占位） */
const README_MIN_LENGTH = 30
/** enrichRepos 的并发上限（PR 验收项：严格 ≤ 3） */
const ENRICH_CONCURRENCY = 3
/**
 * 官方端点的默认模型。**只在 Base URL 也留空**（即真·官方端点）时才用它兜底——
 * 详见 resolveModel()，别的端点套用这个名字是纯粹的坑。
 */
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
/**
 * 本地端点没有 Key 这个概念，但 openai SDK 要求 apiKey 非空。
 * 给它一个占位串即可：Ollama / LM Studio 都不校验这个字段。
 */
const LOCAL_PLACEHOLDER_KEY = 'sk-no-key-required'
/**
 * 缺少 API Key 的提示文案，既是给用户看的，也是「必须冒泡而不是降级」的唯一判据来源。
 * ⚠️ 它是个**哨兵常量**：isConfigError() 拿它做 includes 比较，不要改成字面量、
 * 也不要在别处复制一份（改文案时容易只改一处，降级判断会静默失效）。
 */
const MISSING_KEY_MESSAGE = '未配置 AI API Key，请在「设置 → AI 配置」中填写'
/**
 * 同上，是第二个哨兵常量：填了自定义 Base URL 却没给模型名。
 * 必须和 MISSING_KEY_MESSAGE 一起被 isConfigError() 认出来、一起冒泡给用户——
 * 否则它会被降级路径吞掉，表现成「AI 补全静默把什么都归到『其他』」，比报错难查得多。
 */
const MISSING_MODEL_MESSAGE =
  '已设置自定义 Base URL，但未指定模型名。请在「设置 → AI 配置」中填写服务商支持的模型名（如 deepseek-chat、glm-4-plus）'

/* ------------------------------------------------------------------ */
/* 客户端（模块级懒加载，不在文件顶层 new）                              */
/* ------------------------------------------------------------------ */

let cached: OpenAI | null = null
/**
 * 缓存键。**必须带上 baseUrl**：只比 Key 的话，用户「只换地址、不动 Key」时
 * 会继续命中旧 client，请求打到上一个端点——而换端点正是这套预设要支持的主场景。
 * model 不进缓存键：它是每次调用现取的（resolveModel()），本来就即时生效。
 */
let cachedKey = ''

function cacheKeyOf(key: string, baseUrl: string): string {
  return `${key}\u0000${baseUrl}`
}

function client(): OpenAI {
  const env = getEnv()
  const baseUrl = env.openaiBaseUrl.trim()

  // 本地端点允许没有 Key（Ollama / LM Studio），给 SDK 一个占位串；其余端点仍然必填。
  const apiKey = env.openaiKey || (isLocalEndpoint(baseUrl) ? LOCAL_PLACEHOLDER_KEY : '')
  if (!apiKey) throw new Error(MISSING_KEY_MESSAGE)

  const cacheKey = cacheKeyOf(apiKey, baseUrl)
  if (!cached || cachedKey !== cacheKey) {
    cachedKey = cacheKey
    cached = new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined,
      timeout: 30000,
      maxRetries: 2
    })
  }
  return cached
}

/**
 * 这次该用哪个模型。
 *
 * 三档，顺序即优先级：
 *   1. 用户填了模型名（界面 > .env）→ 用它
 *   2. 没填，但 Base URL 是自定义的 → **明确报错**。绝不能拿 gpt-4o-mini 去凑：
 *      那会换回一个「model not found」，而用户从没输入过这个名字，根本无从改起。
 *   3. 没填，Base URL 也留空 = 真·官方端点 → 官方默认。这条只是为了不破坏
 *      「只填了 Key 就能用」的既有配置。
 */
function resolveModel(): string {
  const env = getEnv()
  const model = env.modelName.trim()
  if (model) return model
  if (env.openaiBaseUrl.trim()) throw new Error(MISSING_MODEL_MESSAGE)
  return DEFAULT_OPENAI_MODEL
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

/**
 * 配置类错误（缺 Key / 缺模型名）是用户必须去设置页处理的，必须冒泡；其余 AI 失败一律降级。
 * 判据是上面两个哨兵常量——所以它们必须被引用而不是复制成字面量。
 */
function isConfigError(err: unknown): boolean {
  const message = errorMessage(err)
  return message.includes(MISSING_KEY_MESSAGE) || message.includes(MISSING_MODEL_MESSAGE)
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
/* 另有 refreshAiConfigCache / testConnection / planSearch 三个非契约导出 */
/* ------------------------------------------------------------------ */

export async function summarize(readme: string): Promise<string> {
  if (isMockMode()) return mockSummary(readme)
  if (!readme || readme.trim().length < README_MIN_LENGTH) return ''

  const started = Date.now()
  try {
    const res = await client().chat.completions.create({
      model: resolveModel(),
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
    // 配置类错误必须让用户看见，其余一律降级为空串（首页不能因为 AI 挂了就崩）
    if (isConfigError(err)) throw err
    console.error('[ai] summarize 失败，已降级返回空摘要:', errorMessage(err))
    return ''
  }
}

/**
 * classify 的内部版本：除了分类结果，还告诉调用方**这一次是不是降级出来的**。
 *
 * 为什么非要这个信号：`classify` 对外承诺不抛错（非配置类失败一律降级），而
 * `'其他'` 同时也是一个**合法分类**——用户完全分不出「AI 挂了」和「这些仓库确实
 * 属于其他」。enrichRepos 靠这个信号数出失败数，才不会把一整份全 `'其他'` 的结果
 * 当成补全成功写进磁盘。
 *
 * 返回的 failure 是给日志和最终报错用的原文，不是给用户看的成品文案。
 */
async function classifyOnce(
  repo: Repo
): Promise<{ category: AiCategory | null; failure: string | null }> {
  if (isMockMode()) {
    const result = mockClassify(repo)
    // 兜底：分类必须落在 AI_CATEGORIES 内，越界一律归到"其他"
    return { category: AI_CATEGORIES.includes(result) ? result : '其他', failure: null }
  }

  try {
    const res = await client().chat.completions.create({
      model: resolveModel(),
      temperature: 0,
      max_tokens: 20,
      messages: [{ role: 'user', content: classifyPrompt(repo) }]
    })
    // 模型可能回裸词，也可能回 JSON / 围栏，extractContent 两种都兼容（见 ai-prompts.ts 顶部契约）
    const category = normalizeCategory(extractContent(res.choices[0]?.message?.content))
    console.log(`[ai] classify ${repo.full_name} -> ${category}`)
    return { category, failure: null }
  } catch (err) {
    // 配置类错误照旧冒泡：它是"该怎么修"的明确指路，不能被降级掉
    if (isConfigError(err)) throw err
    const message = errorMessage(err)
    console.error(`[ai] classify 失败，已降级为"其他"：${repo.full_name}`, message)
    return { category: null, failure: message }
  }
}

export async function classify(repo: Repo): Promise<AiCategory> {
  const { category } = await classifyOnce(repo)
  // 降级值仍然是 '其他'：这个函数（IPC AI_CLASSIFY）的对外契约就是"要么给一个分类，
  // 要么抛配置错误"，不抛错的承诺不能在这里破。区分失败的责任在 enrichRepos。
  return category ?? '其他'
}

/**
 * 把这一轮的 AI 结果贴回**库里当前那份**仓库列表，返回合并后的整份列表。
 *
 * 为什么不直接 saveRepos(入参派生的那份)：补全要跑几分钟，这期间用户完全可能已经
 * Star 了新仓库、取消收藏了旧的、clone 完了一个仓库，而 saveRepos 是整份替换——
 * 写进去的会是补全开始那一刻的旧快照，把这几分钟里的改动全抹掉，而且会落盘。
 *
 * 三个刻意的取舍：
 *  1. 以**库为准**遍历，不是以结果为准：补全期间被取消收藏的那些自然不会被复活。
 *  2. 只贴 ai_category / ai_summary，其余字段（cloned_path、forked_full_name、
 *     星标数…）一律保留库里的值。
 *  3. 只在结果里**有值**时才贴：分类失败的那种带着 undefined 回来（见 enrichOne），
 *     拿它覆盖会把上一轮已经算好的分类抹掉。
 * 用 full_name 而不是 id 做键：本文件其余写路径（updateLocalState、clearClonedPaths）
 * 也都是这个口径。
 */
async function mergeAiResults(results: Repo[]): Promise<Repo[]> {
  const byFullName = new Map(results.map((r) => [r.full_name, r]))
  const current = await store.getRepos()
  return current.map((repo) => {
    const fresh = byFullName.get(repo.full_name)
    if (fresh === undefined) return repo
    const next: Repo = { ...repo }
    if (fresh.ai_category !== undefined) next.ai_category = fresh.ai_category
    if (fresh.ai_summary !== undefined) next.ai_summary = fresh.ai_summary
    return next
  })
}

/* ------------------------------------------------------------------ */
/* 分类补全进度（enrich 的实时状态）                                     */
/* ------------------------------------------------------------------ */

/**
 * enrich 的进行状态。本项目没有 main→renderer 推送，所以进度必须由主进程在跑的
 * 过程中记在内存里、渲染进程另开一条查询通道来拉（IPC.AI_ENRICH_PROGRESS）。
 *
 * 生命周期刻意做成"跑完即归零"：enrichRepos 的 finally 里把它复位成
 * `{ running:false, done:0, total:0 }`。这是诚实性要求——渲染进程在 enrich 的
 * invoke 返回之后还会再问一次，读到的必须是"没在跑"，绝不能是一条停在 100%
 * 上的记录（那会让界面显示成"这次跑完了"，而它其实只是上一次的残影）。
 *
 * `total === 0` 单独表示"总数还未知"（尚未开始记录），渲染进程据此显示不带数字的
 * 忙碌态，而不是拿 0 冒充进度。
 */
let enrichProgress: AiEnrichProgress = { running: false, done: 0, total: 0 }

/**
 * 读一次当前的补全进度。纯内存、同步、不抛错——给渲染进程在 enrich 进行中按固定
 * 间隔轮询用。返回副本而不是内部对象，避免调用方拿着引用去改内部状态
 * （跨 IPC 本来就是结构化克隆，这里只是把同一约定写死）。
 */
export function getEnrichProgress(): AiEnrichProgress {
  return { ...enrichProgress }
}

export async function enrichRepos(repos: Repo[]): Promise<Repo[]> {
  // 这一轮真正去问了模型的有几个、其中失败几个。用来在最后判断是不是「全军覆没」
  let attempted = 0
  let failed = 0
  let firstFailure: string | null = null

  // 跳过逻辑必须写在 mock 分支之外：MOCK_MODE=true 时 mockEnrich 内部同样带跳过，
  // 这样两种模式的可观察行为才一致（骨架版 mockEnrich 每次都重算，见 mock.ts）。
  const enrichOne = async (repo: Repo): Promise<Repo> => {
    // 1. 两个字段都齐了直接原样返回，省额度
    if (repo.ai_category && repo.ai_summary) return repo

    // 2. 分类
    attempted += 1
    const { category, failure } = await classifyOnce(repo)
    if (failure !== null) {
      failed += 1
      if (firstFailure === null) firstFailure = failure
    }

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

    const next: Repo = { ...repo, ai_summary: summary || undefined }
    // ⚠️ 分类失败时**不写假值**：留着原来那个 ai_category（通常是 undefined，界面上
    // 显示「未分类」），下次补全会重试。拿 '其他' 顶上等于替用户下了个结论——
    // 而真相是我们根本没问到。
    if (category !== null) next.ai_category = category
    return next
  }

  if (isMockMode()) return mockEnrich(repos)

  // 开始记录进度：total 用**这一次收到的仓库数**（含那些两个字段都齐、会被 skip 的
  // 仓库）——渲染进程要的就是"跑到第几个 / 一共几个"，总数对得上入参才对得上界面。
  // 放在 mock 提前返回之后：mock 下不另造一份假进度（与 local.ts 的 clone 进度同一条
  // 约定——全项目只有 mock.ts 一个假数据源）。
  const total = repos.length
  enrichProgress = { running: true, done: 0, total }

  const limit = pLimit(ENRICH_CONCURRENCY)
  let done = 0
  const tasks = repos.map((r) =>
    limit(async () => {
      const result = await enrichOne(r)
      done += 1
      // 每个仓库真正跑完（成功或降级）才 +1，不提前报数
      enrichProgress = { running: true, done, total }
      if (done % 5 === 0 || done === repos.length) {
        console.log(`[ai] 已补全 ${done}/${repos.length}`)
      }
      return result
    })
  )

  try {
    const enriched = await Promise.all(tasks)

    // 一个都没分类成功 = 全军覆没。这几乎一定是整体性问题（Key 错、模型名错、
    // 本地端点没起、中转挂掉、限频），而不是"这些仓库恰好都归其他"。
    // 把这样一份结果写盘、再弹一句「AI 补全完成」，就是在替用户确认一件没发生过的事——
    // 而且它会被落盘污染，重跑一次照样如此。宁可整批失败，让用户看见真话。
    if (attempted > 0 && failed === attempted) {
      throw new Error(
        `${attempted} 个仓库一个都没分类成功（${firstFailure ?? '未知原因'}）`
      )
    }

    // ⚠️ 不能直接 store.saveRepos(enriched)。enriched 是从**本函数收到的那份入参**
    // 派生的，而补全要跑几分钟——这期间用户完全可能已经 Star 了新仓库、取消收藏了旧的、
    // 或者 clone 完了一个仓库。saveRepos 是"整份替换"，写进去的会是那份旧快照：
    // 刚 Star 的没了、刚取消收藏的又回来了、clone 路径退回到没记录。属于纯数据丢失，
    // 而且会落盘。
    //
    // 所以按 id 合并**当前**库里的那份：只把 AI 结果贴上去，其余字段一律以库里为准；
    // 库里已经没有的（补全期间被取消收藏）自然不会被复活，库里新出现的（补全期间 Star 的）
    // 保持原样、下次补全再处理。返回合并后的整份列表——渲染层会拿它直接替换内存里的列表，
    // 返回旧的 enriched 等于把上面这些覆盖又在界面上重演一遍。
    const merged = await mergeAiResults(enriched)
    await store.saveRepos(merged)
    if (failed > 0) {
      // 部分失败：写盘的是成功那部分，失败的那几条保持「未分类」，下次会重试
      console.warn(`[ai] 有 ${failed}/${attempted} 个仓库分类失败，已保持未分类状态`)
    }
    return merged
  } catch (err) {
    // 能落到这里的只有两种：
    //   1) 配置类错误（缺 Key / 缺模型名）——把原文透给用户，让他知道该去设置页改哪个字段；
    //   2) 上面那个「全军覆没」——它的文案自带数量和原因，套一层前缀正好读得通。
    // 两种情况都不写库：半截结果（尤其是一份全 '其他' 的结果）比什么都没有更坏。
    if (isConfigError(err)) throw err
    console.error('[ai] enrichRepos 失败:', errorMessage(err))
    throw new Error(`AI 补全失败: ${errorMessage(err)}`)
  } finally {
    // 成功、部分失败、整批抛错——三种结局都要立即复位。跑完之后渲染进程再问一次，
    // 读到的必须是 { running:false, done:0, total:0 }，界面据此收起进度、绝不
    // 停在满格上冒充"这次跑完了"（诚实性要求，见 enrichProgress 的说明）。
    enrichProgress = { running: false, done: 0, total: 0 }
  }
}

/**
 * 周报总结。
 *
 * releases 是「本周有新版本的那几个收藏」（由 report.ts 查好传进来，默认空）。
 * 它让总结从「你收藏了什么」变成「你关注的东西这周发生了什么」——一个收藏了半年、
 * 这周发了 v2.0 的项目，比本周新 Star 的陌生仓库更值得写进周报。
 *
 * releases 的处理与整体一致：模型不可用时，本地兜底文案也要把新版本说出来，
 * 否则「AI 没配」就等于这个功能不存在。
 */
export async function generateReport(
  repos: Repo[],
  releases: RepoRelease[] = []
): Promise<string> {
  if (isMockMode()) return mockReportSummary(repos)
  if (repos.length === 0) return '本周没有新增 Star。'

  const topLang = topLanguage(repos)
  const topRepo = pickTopRepo(repos)
  const releaseLine =
    releases.length === 0
      ? ''
      : `另外收藏里的 ${releases[0].fullName} 等 ${releases.length} 个项目这周发了新版本，值得回去看看。`
  const fallback =
    `本周新增 ${repos.length} 个 Star，主力语言是 ${topLang}，` +
    `其中 ${topRepo?.full_name ?? '—'} 最值得一看。${releaseLine}`

  try {
    const res = await client().chat.completions.create({
      model: resolveModel(),
      temperature: 0.6,
      max_tokens: 500,
      messages: [{ role: 'user', content: reportPrompt(repos, releases) }]
    })
    const text = readContent(res.choices[0]?.message)
    // 模型返回空白时同样走本地兜底，report.generate() 的调用方永远能拿到一段文案
    return text || fallback
  } catch (err) {
    // 这个函数被 report.ts 调用，必须稳定不抛错（配置错误也降级，首页/周报页不能崩）
    console.error('[ai] generateReport 失败，已降级为本地文案:', errorMessage(err))
    return fallback
  }
}

/* ------------------------------------------------------------------ */
/* 收藏画像（总览页）                                                    */
/* ------------------------------------------------------------------ */

/**
 * 把一份**已经算好的统计摘要**交给模型，换回一段「你的收藏口味」的解读。
 *
 * 与 summarize / classify 的关键区别：本函数**承诺不抛错**，任何失败都从 data 里
 * 返回一句人话。理由见 CollectionAnalysis 的注释——它是总览页上一个可选的增强卡片，
 * 没配 Key 或中转挂了都不该把总览页拖垮，更不该弹一条红色 toast。
 *
 * 摘要由渲染进程算好后传进来（那边的纯函数已经有现成的统计结果），主进程只负责调模型。
 */
export async function analyzeCollection(digest: string): Promise<CollectionAnalysis> {
  const text = digest.trim()
  if (!text) return { text: '', hint: '还没有可分析的数据，先同步一次 Star 列表。' }
  if (isMockMode()) return { text: mockCollectionAnalysis(), hint: '' }

  // 配置类错误同样降级成 hint：这里是「增强卡片」，不是用户主动发起的必答操作
  let model: string
  try {
    model = resolveModel()
  } catch (err) {
    return { text: '', hint: errorMessage(err) }
  }

  const env = getEnv()
  if (!env.openaiKey && !isLocalEndpoint(env.openaiBaseUrl)) {
    return {
      text: '',
      hint: '还没配置 AI：到「设置 → AI 配置」填好 Key（或指向本地 Ollama / LM Studio）就能生成。'
    }
  }

  const started = Date.now()
  try {
    const res = await client().chat.completions.create({
      model,
      // 比分类高、比周报低：要一点表达力，但不能开始自由发挥
      temperature: 0.5,
      max_tokens: 400,
      messages: [{ role: 'user', content: collectionAnalysisPrompt(text) }]
    })
    const out = readContent(res.choices[0]?.message)
    if (!out) return { text: '', hint: '模型这次没返回内容，稍后再点一次试试。' }
    console.log(`[ai] analyzeCollection 完成，耗时 ${Date.now() - started}ms`)
    return { text: out, hint: '' }
  } catch (err) {
    console.error('[ai] analyzeCollection 失败:', errorMessage(err))
    return { text: '', hint: `生成失败：${classifyConnectionError(err)}` }
  }
}

/* ------------------------------------------------------------------ */
/* 配置热更新与连接探针                                                 */
/* ------------------------------------------------------------------ */

/**
 * 把一句自然语言查询翻译成结构化搜索计划（PR 4，「仓库推荐」用）。
 *
 * ⚠️ **任何失败都返回 null，绝不抛错**——包括「没配 AI Key」这个最常见的情况。
 * 调用方（recommend.forQuery）拿不到计划就退化成"直接用清洗过的原句搜索"，
 * 所以推荐功能只要有 GitHub Token 就能用。这是刻意的：AI 让它更准，不是让它能跑。
 *
 * MOCK_MODE 下也直接返回 null：mock 语料就那么几条，关键词匹配已经够演示了，
 * 没必要再编一份假计划。
 */
export async function planSearch(query: string): Promise<SearchPlan | null> {
  const q = query.trim()
  if (!q || isMockMode()) return null

  try {
    const res = await client().chat.completions.create({
      model: resolveModel(),
      temperature: 0,
      max_tokens: 200,
      messages: [{ role: 'user', content: searchPlanPrompt(q) }]
    })
    const plan = parseSearchPlan(res.choices[0]?.message?.content)
    console.log(`[ai] planSearch -> ${plan ? JSON.stringify(plan) : 'null（退回原句搜索）'}`)
    return plan
  } catch (err) {
    console.error('[ai] planSearch 失败，退回原句搜索:', errorMessage(err))
    return null
  }
}

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
  const where = getEnv().openaiBaseUrl || '默认端点'

  // 连接类错误没有 HTTP status，必须先于 status 判断（超时是连接错误的子类）
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return `连接 ${where} 超时，请检查网络或 Base URL 是否可达`
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return `连不上 ${where}，请检查 Base URL 与网络（本地端点要确认服务已经启动）`
  }

  const status = (err as { status?: number }).status
  if (status === 401 || err instanceof OpenAI.AuthenticationError) {
    return 'API Key 无效（401），请检查 Key 是否正确、是否已被撤销或过期'
  }
  if (status === 403) {
    return '没有访问权限（403），该 Key 可能未被允许调用此模型'
  }
  if (status === 404 || err instanceof OpenAI.NotFoundError) {
    return `Base URL 或模型名不对（404）：确认 ${where} 是服务商文档上的完整地址，以及模型名在该服务商处确实存在`
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
  // MOCK_MODE 下不允许发起任何真实网络请求（项目铁律），直接返回说明。
  // 放在最前面：mock 下没理由因为「模型名没配」而报配置错误。
  if (isMockMode()) {
    const env = getEnv()
    return {
      ok: true,
      message: 'Mock 模式不发起真实请求',
      model: env.modelName.trim() || DEFAULT_OPENAI_MODEL
    }
  }

  // 这个函数对外承诺「不抛错」，所以配置错误也要兜住，转成 ok:false + 人话文案
  let model: string
  try {
    model = resolveModel()
  } catch (err) {
    return { ok: false, message: errorMessage(err), model: '' }
  }

  const env = getEnv()
  // 先自查 key：比让 client() 抛错更早、也更明确。
  // 本地端点（Ollama / LM Studio）本来就没有 Key，不能按缺配置处理。
  if (!env.openaiKey && !isLocalEndpoint(env.openaiBaseUrl)) {
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
