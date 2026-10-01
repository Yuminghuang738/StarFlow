// 负责人：P4 ｜ 规格见 guide.md 第 10 节

import type { Repo } from '@shared/types'
import { isMockMode } from './config'
import { mockSimilar } from './mock'

export async function similar(fullName: string): Promise<Repo[]> {
  if (isMockMode()) return mockSimilar(fullName)
  throw new Error('NOT_IMPLEMENTED: recommend.similar')
}
