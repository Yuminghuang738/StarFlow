// 负责人：P2 ｜ 规格见 guide.md 第 10 节
// 真实实现要点（P2 补）：用 openai SDK，key 从 config.getEnv() 取；
// enrichRepos 内部用 p-limit 3 并发，结果写回 store.saveRepos() 后返回完整列表。

import type { Repo, AiCategory } from '@shared/types'
import { AI_CATEGORIES } from '@shared/types'
import { isMockMode } from './config'
import { mockSummary, mockClassify, mockEnrich, mockReportSummary } from './mock'

export async function summarize(readme: string): Promise<string> {
  if (isMockMode()) return mockSummary(readme)
  throw new Error('NOT_IMPLEMENTED: ai.summarize')
}

export async function classify(repo: Repo): Promise<AiCategory> {
  if (isMockMode()) {
    const result = mockClassify(repo)
    // 兜底：分类必须落在 AI_CATEGORIES 内，越界一律归到"其他"
    return AI_CATEGORIES.includes(result) ? result : '其他'
  }
  throw new Error('NOT_IMPLEMENTED: ai.classify')
}

export async function enrichRepos(repos: Repo[]): Promise<Repo[]> {
  if (isMockMode()) return mockEnrich(repos)
  throw new Error('NOT_IMPLEMENTED: ai.enrichRepos')
}

export async function generateReport(repos: Repo[]): Promise<string> {
  if (isMockMode()) return mockReportSummary(repos)
  throw new Error('NOT_IMPLEMENTED: ai.generateReport')
}
