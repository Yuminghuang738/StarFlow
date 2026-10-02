// 负责人：P2 ｜ AI 提示词（从 ai.ts 抽出的纯函数）
//
// 为什么单独成文件：提示词是**纯函数**（无 IO、无副作用、不读环境、不读时间），
// 这样能离线断言 prompt 内容（classify 必须含全部 7 个枚举、周报必须含「不得编造」），
// 不需要起进程、不需要网络。
//
// ⚠️ prompt 与解析器的契约（抽出去以后最容易漂移的地方）：
//   ai.ts 用 extractContent() 清洗模型输出，它**同时兼容两种形态**：
//     ① 裸词/裸文本    —— 例如直接回 "前端"，extractContent 原样返回，normalizeCategory 收敛
//     ② JSON 或围栏     —— 例如 `{"category": "后端"}` / ```json ... ```，
//                          extractContent 先剥围栏，再取 "category" 键的值
//   所以本文件里的所有 prompt 都可以放心要求"输出 JSON"或"只回一个词"，两边都接得住。
//   改动任一 prompt 的输出格式之前，先确认 extractContent 仍然兼容；改动 extractContent
//   之前，先确认本文件所有 prompt 都还在它的兼容范围内。
//
// 硬约束（与 ai.ts 一致，别在这里破）：
//   - 不要求模型走 response_format（大量第三方中转不支持，会直接 400）
//   - classify 必须收敛到 7 个枚举内（由 ai.ts 的 normalizeCategory 兜底）
//   - reportPrompt 只依据给定列表，绝不编造仓库

import type { Repo } from '@shared/types'
import { AI_CATEGORIES } from '@shared/types'

/** 送模型前 README 的最大字符数，避免无谓的额度消耗 */
export const README_LIMIT = 6000
/** 周报提示词里最多列多少个仓库 */
export const REPORT_REPO_LIMIT = 50

/**
 * 摘要提示词（system 角色那条「你是技术文档摘要助手」由 ai.ts 保留，不进这里）。
 *
 * 重点改进：明确要求忽略 README 顶部的徽章 / CI 状态 / 许可证行——这是摘要跑偏的
 * 头号来源（模型经常把一堆 build passing 徽章当成项目用途复述出来）。
 */
export function summarizePrompt(readme: string): string {
  return `请用一句中文总结下面这个开源项目的用途和亮点。要求：
1) 不超过 50 字
2) 不要以"这个项目"开头
3) 不要 markdown、不要换行、不要引号
4) 直接输出摘要，不要任何前缀
5) 忽略 README 顶部的徽章、CI/构建状态、覆盖率、许可证等装饰性内容，只看项目本身做什么
---
${readme.slice(0, README_LIMIT)}`
}

/**
 * 分类提示词：给 7 个枚举各补一句边界定义。
 *
 * 「工具 / 后端 / DevOps」是最容易混的三类，边界写清楚能显著减少模型乱猜；
 * 但**收敛兜底仍然由 ai.ts 的 normalizeCategory 负责**，这里的定义只是提高命中率，
 * 不是最终保证——模型仍可能回脏词，normalizeCategory 把它压回枚举。
 */
export function classifyPrompt(repo: Repo): string {
  const categories = AI_CATEGORIES.join('、')
  return `请判断下面这个 GitHub 仓库属于哪个分类。只能从以下 7 个词中选择**一个**，不要输出任何其它内容：
${categories}

各类边界（据此判断，不要自由发挥）：
- AI/ML：模型训练与推理、深度学习框架、大模型/LLM、计算机视觉、语音、数据科学等与人工智能直接相关的库或应用
- 前端：浏览器/客户端界面相关——UI 框架、组件库、CSS、前端路由与状态管理等
- 后端：服务端、HTTP API、数据库、消息队列、网络协议、分布式与微服务等
- DevOps：部署与运维——CI/CD、容器与编排、监控告警、基础设施即代码、云原生平台
- 工具：难以归入以上各类的通用开发辅助——CLI、编辑器插件、格式化/lint、诊断调试、构建打包工具（webpack/vite 这类通用构建器）
- 学习资源：以"教人"为目的的仓库——教程、课程、面试题、书籍、awesome 清单、路线图
- 其他：确实无法判断时选它

仓库全名：${repo.full_name}
描述：${repo.description ?? '（无）'}
主要语言：${repo.language ?? '（未知）'}
主题标签：${repo.topics.join(', ') || '（无）'}
只回复那一个词。`
}

/**
 * 本周有新版本的收藏：仓库名 + 它最新的那个 Release。
 *
 * 为什么要把这个喂给模型：原来的周报只拿到「本周新增了哪些 Star」，模型能说的
 * 就只有"你收藏了什么"；而周报真正该回答的是"**我关注的东西这周发生了什么**"——
 * 一个收藏了半年、这周发了 v2.0 的项目，比本周新 Star 的一个陌生仓库更值得提。
 */
export interface RepoRelease {
  fullName: string
  tag: string
  /** 上游没给 Release 起名时为 null */
  name: string | null
  publishedAt: string
  htmlUrl: string
}

/**
 * 周报提示词。
 *
 * 重点改进：明确「**不得编造**列表之外的仓库」——模型偶尔会为了凑字数引入
 * 训练数据里的知名项目（react/vue 之类），读起来很合理，但列表里根本没有。
 *
 * ai.ts 的 generateReport 保持「任何失败都返回本地兜底文案、绝不抛错」：
 * 本函数只负责拼 prompt，不做任何 IO。
 *
 * releases 默认空数组：没有新版本时**不能**在 prompt 里提"新版本"这回事，
 * 否则模型会顺着这个话头编出几个不存在的 Release。
 */
export function reportPrompt(repos: Repo[], releases: RepoRelease[] = []): string {
  const list = repos
    .slice(0, REPORT_REPO_LIMIT)
    .map(
      (r) =>
        `${r.full_name} (${r.language ?? '未知'}, ${r.ai_category ?? '未分类'}, ${r.stargazers_count} stars)`
    )
    .join('\n')

  const releaseRule =
    releases.length === 0
      ? ''
      : '\n7) 下面「本周发了新版本」那一段必须提一句，但不要逐个念 tag 号，挑 1~2 个说就行'
  const releaseBlock =
    releases.length === 0
      ? ''
      : `\n\n本周发了新版本（你收藏过、且这周发布了 Release 的项目）：\n${releases
          .map((r) => `${r.fullName} 发布了 ${r.tag}${r.publishedAt ? `（${r.publishedAt.slice(0, 10)}）` : ''}`)
          .join('\n')}`

  return `请根据下面的本周新增 Star 列表，写一段中文周报总结。
要求：
1) 100~200 字
2) 语气自然口语，像人在群里汇报工作，不要"综上所述""总而言之"这种套话
3) 提到本周新增数量、主力语言、以及最值得关注的 1~2 个项目
4) 不要 markdown、不要分点、不要换行
5) 直接输出这段话
6) 只依据下面给出的列表，不得编造列表之外的仓库或数据${releaseRule}
---
${list}${releaseBlock}`
}

/* ------------------------------------------------------------------ */
/* 收藏画像（总览页的 AI 统计分析）                                      */
/* ------------------------------------------------------------------ */

/**
 * 收藏画像提示词：喂进去的是一份**已经算好的统计摘要**，不是原始仓库列表。
 *
 * 为什么喂摘要而不是像周报那样喂列表：总览页要的是「你这个人收藏的口味」这种
 * 聚合判断，几十上百条仓库名反而会让模型开始复述具体项目（甚至编造）。摘要里
 * 每个数字都在主进程之外算好了，模型只负责解读，编造的空间很小。
 *
 * 与 reportPrompt 同一条铁律：**只依据给定数据，不得编造**。
 */
export function collectionAnalysisPrompt(digest: string): string {
  return `下面是一位开发者 GitHub Star 收藏库的统计摘要。请写一段中文分析，帮他看清自己的收藏口味。
要求：
1) 120~200 字
2) 说人话，像熟悉他的朋友在点评，不要"综上所述""总而言之"这种套话
3) 至少点出：收藏集中在哪个方向、语言与技术栈偏好、以及一个值得注意的倾向（比如过于偏科、收藏了但没动过、老项目偏多）
4) 只依据下面给出的数据，不得编造仓库名、数字或列表中不存在的结论
5) 不要 markdown、不要分点、不要换行，直接输出这段话
---
${digest}`
}

/* ------------------------------------------------------------------ */
/* 搜索计划（PR 4）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 搜索计划：把用户的一句话翻成**结构化**条件，再由 main/recommend.ts 确定性地
 * 拼成 GitHub 查询串。
 *
 * 为什么不让模型直接写 `q`：模型写限定符时一个语法错误（多一个引号、写成中文冒号）
 * 就会静默返回 0 结果，而且分不清是模型错还是 GitHub 错。结构化输出 + 主进程拼接，
 * 模型再怎么自由发挥也越不出下面这几个字段，值还会被 escapeQualifier 洗一遍。
 */
export interface SearchPlan {
  /** 查询关键词，唯一必填项 */
  keywords: string
  /** GitHub 的语言名（英文，如 TypeScript / Rust），不确定就给 null */
  language: string | null
  /** 一个 GitHub topic（英文小写连字符，如 machine-learning），不确定就给 null */
  topic: string | null
  /** 星数下限，只要一个整数；用户没提就给 null */
  minStars: number | null
}

export function searchPlanPrompt(query: string): string {
  return `你在把用户的一句话需求翻译成 GitHub 仓库搜索条件。请只输出一个 JSON 对象，不要任何解释、不要 markdown 围栏。

字段说明：
- keywords：核心关键词，2~4 个词，用空格分隔。**默认用英文**（GitHub 上绝大多数仓库名/描述是英文），除非这个词本身没有通用的英文写法（比如"中文分词"）。不要包含任何 GitHub 限定符语法。
- language：如果用户明确提到了编程语言就填它的英文名，否则填 null。
- topic：如果能对应到一个 GitHub topic 就填（英文小写、用连字符连接，例如 machine-learning、web-framework、cli-tool），否则填 null。不要瞎编 topic。
- minStars：如果用户表达了对热度的要求（"热门""高星""很多人用"）就给一个整数（通常 500~5000），否则填 null。

示例输出：
{"keywords":"offline ocr chinese","language":null,"topic":"ocr","minStars":500}

用户的需求：${query}`
}

/**
 * 解析搜索计划。
 *
 * ⚠️ 刻意**不复用 ai.ts 的 extractContent()**：那个是给分类专用的（专找
 * `"category":"…"` 这个键），套到这里只会把 JSON 拆坏。这里自己 JSON.parse，
 * 逐字段 typeof 收窄，**绝不抛错**——解析不出来就返回 null，调用方退化成
 * "直接用原句搜索"，功能不会因为模型抽风而不可用。
 */
export function parseSearchPlan(raw: string | null | undefined): SearchPlan | null {
  const text = (raw ?? '').trim()
  if (!text) return null

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1].trim() : text

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    // 模型偶尔会在 JSON 前后各带一句话。退一步：取第一个 { 到最后一个 } 再试一次。
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      parsed = JSON.parse(body.slice(start, end + 1))
    } catch {
      return null
    }
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const o = parsed as Record<string, unknown>

  const keywords = typeof o.keywords === 'string' ? o.keywords.trim() : ''
  // 关键词是唯一必填项：缺了它整份计划没有意义，不如直接退化成原句搜索
  if (!keywords) return null

  const language = typeof o.language === 'string' && o.language.trim() !== '' ? o.language.trim() : null
  const topic = typeof o.topic === 'string' && o.topic.trim() !== '' ? o.topic.trim() : null

  const minStarsNum = typeof o.minStars === 'number' ? o.minStars : Number.NaN
  const minStars =
    Number.isFinite(minStarsNum) && minStarsNum > 0 ? Math.floor(minStarsNum) : null

  return { keywords, language, topic, minStars }
}
