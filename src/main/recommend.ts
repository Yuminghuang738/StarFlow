// 接口规格见 docs/module-signatures.md（冻结）

import type { Repo } from '@shared/types'
import { isMockMode } from './config'
import { mockSimilar } from './mock'

export async function similar(fullName: string): Promise<Repo[]> {
  if (isMockMode()) return mockSimilar(fullName)
  throw new Error('NOT_IMPLEMENTED: recommend.similar')
}
