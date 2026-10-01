// 极简运行配置，只做读环境变量，不读文件、不抛错

/**
 * 界面填写的 AI 配置覆盖层（模块级内存态）。
 *
 * 存在的唯一理由：让 ai.client() 保持同步。client() 被四个导出函数同步调用
 * （`client().chat.completions.create(...)`），如果把配置改成异步读取，async 会
 * 传染到整条链路，而它唯一的异步点只是「读一次配置」。
 *
 * 优先级：**界面里填的 > .env > 空串**。界面填写是用户的显式动作，「填了没反应」
 * 是明确 bug；.env 在本项目定位只是开发者引导默认值。清除界面 key 后自然退回 env。
 *
 * 写入时机见 ai.refreshAiConfigCache()（启动预热 + 保存/清除 AI 配置各一次）。
 * 覆盖层必须写在 config.ts：store.ts 依赖 config.isMockMode()，反过来 import 会成环。
 */
let aiOverride: { apiKey?: string; baseUrl?: string; model?: string } = {}

export function setAiOverride(patch: Partial<{ apiKey: string; baseUrl: string; model: string }>): void {
  aiOverride = { ...patch }
}

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === 'true'
}

export function getEnv(): {
  openaiKey: string
  openaiBaseUrl: string
  modelName: string
  githubToken: string
  githubOauthClientId: string
} {
  return {
    // 空串也走覆盖层：清除界面 key 之后 aiOverride.apiKey 为 ''，此时 || 让它退回 env。
    openaiKey: aiOverride.apiKey || (process.env.OPENAI_API_KEY ?? ''),
    openaiBaseUrl: aiOverride.baseUrl || (process.env.OPENAI_BASE_URL ?? ''),
    modelName: aiOverride.model || (process.env.MODEL_NAME ?? ''),
    githubToken: process.env.GITHUB_TOKEN ?? '',
    githubOauthClientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? ''
  }
}
