// 极简运行配置，只做读环境变量，不读文件、不抛错

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
    openaiKey: process.env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? '',
    modelName: process.env.MODEL_NAME ?? '',
    githubToken: process.env.GITHUB_TOKEN ?? '',
    githubOauthClientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? ''
  }
}
