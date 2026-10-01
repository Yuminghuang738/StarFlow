// ai.ts 的自检脚手架：把 electron 打桩，让主进程模块能脱离 Electron 直接跑。
// 只覆盖 ai.ts 依赖链上真正用到的 API（store.ts 需要 app.getPath / safeStorage）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'starpilot-selfcheck-'))

export const app = {
  getPath: () => userData
}

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s) => Buffer.from(s),
  decryptString: (b) => b.toString()
}

export const shell = {
  openPath: async () => ''
}
