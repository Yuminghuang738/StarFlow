// 负责人：P1 ｜ 接口规格见 docs/module-signatures.md（冻结），任务说明见 prompts/
// 骨架阶段：mock 分支直接调 mock.ts，真实实现留 throw。
// P1 接手时只需把每个 throw 换成真实实现，签名不要动。

import type { Repo, Release, Commit } from '@shared/types'
import { isMockMode } from './config'
import { mockStarred, mockReadme, mockReleases, mockCommits, mockUnstar, mockFork } from './mock'

export async function fetchStarred(): Promise<Repo[]> {
  if (isMockMode()) return mockStarred()
  throw new Error('NOT_IMPLEMENTED: github.fetchStarred')
}

export async function fetchReadme(fullName: string): Promise<string> {
  if (isMockMode()) return mockReadme(fullName)
  throw new Error('NOT_IMPLEMENTED: github.fetchReadme')
}

export async function fetchReleases(fullName: string): Promise<Release[]> {
  if (isMockMode()) return mockReleases(fullName)
  throw new Error('NOT_IMPLEMENTED: github.fetchReleases')
}

export async function fetchCommits(fullName: string): Promise<Commit[]> {
  if (isMockMode()) return mockCommits(fullName)
  throw new Error('NOT_IMPLEMENTED: github.fetchCommits')
}

export async function unstar(fullName: string): Promise<void> {
  if (isMockMode()) {
    mockUnstar(fullName)
    return
  }
  throw new Error('NOT_IMPLEMENTED: github.unstar')
}

export async function fork(fullName: string): Promise<Repo> {
  if (isMockMode()) return mockFork(fullName)
  throw new Error('NOT_IMPLEMENTED: github.fork')
}
