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
 * 周报提示词。
 *
 * 重点改进：明确「**不得编造**列表之外的仓库」——模型偶尔会为了凑字数引入
 * 训练数据里的知名项目（react/vue 之类），读起来很合理，但列表里根本没有。
 *
 * ai.ts 的 generateReport 保持「任何失败都返回本地兜底文案、绝不抛错」：
 * 本函数只负责拼 prompt，不做任何 IO。
 */
export function reportPrompt(repos: Repo[]): string {
  const list = repos
    .slice(0, REPORT_REPO_LIMIT)
    .map(
      (r) =>
        `${r.full_name} (${r.language ?? '未知'}, ${r.ai_category ?? '未分类'}, ${r.stargazers_count} stars)`
    )
    .join('\n')

  return `请根据下面的本周新增 Star 列表，写一段中文周报总结。
要求：
1) 100~200 字
2) 语气自然口语，像人在群里汇报工作，不要"综上所述""总而言之"这种套话
3) 提到本周新增数量、主力语言、以及最值得关注的 1~2 个项目
4) 不要 markdown、不要分点、不要换行
5) 直接输出这段话
6) 只依据下面给出的列表，不得编造列表之外的仓库或数据
---
${list}`
}
