// 自检脚手架：把 electron 打桩，让 src/main/*.ts 能脱离 Electron 直接跑。
// 覆盖主进程实际用到的 API：app.getPath / safeStorage / shell.openPath / shell.openExternal
// / BrowserWindow / dialog。
//
// 可选环境变量（都不设也能跑，行为与最初 ai.ts 自检时的桩一致）：
//   RUN_ID            数据目录标识。设了 → 落到 out/selfcheck/data/<RUN_ID>/（可复现、可重复跑，跑前自行清目录）；
//                     不设 → 每次进程用一个一次性临时目录（各自干净，互不干扰）。
//   SAFESTORAGE_MODE  'none' 模拟没有 keyring 的 Linux（**默认**）；其它值模拟有 keyring。
//   SAFESTORAGE_KEY   模拟「换机器 / keyring 变更」：密钥变了，旧密文就解不开。
//   WINDOW_MODE       'present' 时 BrowserWindow.getAllWindows() 假装有一个主窗口，
//                     用来验证 dialog 是否收到了 parent window（模态）。
//   DIALOG_MODE       'cancel'（默认）模拟用户点取消；'pick:<path>' 模拟选中某个目录。
//
// ⚠️ 默认值刻意保守：不设任何环境变量时 safeStorage 视为「不可用」，
//    与 ai.ts 自检时期的桩行为保持一致，避免影响既有自检结论。
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const root = process.env.RUN_ID
  ? join(projectRoot, 'out', 'selfcheck', 'data', process.env.RUN_ID)
  : mkdtempSync(join(tmpdir(), 'starpilot-selfcheck-'))

export const app = {
  getPath(name) {
    const dir = join(root, name)
    mkdirSync(dir, { recursive: true })
    return dir
  }
}

const mode = () => process.env.SAFESTORAGE_MODE ?? 'none'
const key = () => process.env.SAFESTORAGE_KEY ?? 'key-A'

export const safeStorage = {
  isEncryptionAvailable: () => mode() !== 'none',
  // 用「密钥:明文」模拟真实加密：密钥不对就解不开，从而能测「换机器」的降级路径。
  encryptString: (value) => Buffer.from(`${key()}:${value}`, 'utf8'),
  decryptString: (buf) => {
    const raw = Buffer.from(buf).toString('utf8')
    const prefix = `${key()}:`
    if (!raw.startsWith(prefix)) {
      throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
    }
    return raw.slice(prefix.length)
  }
}

export const shell = {
  // 真实 shell.openPath 不 reject，而是返回错误字符串（空串表示成功），
  // 所以桩也必须按返回值语义实现，否则测不出 openDir 是否核对了返回值。
  async openPath(target) {
    return existsSync(target) ? '' : 'Failed to open path'
  },
  // auth.ts 的设备流会用 shell.openExternal 拉起浏览器。真机失败时是 reject 语义，
  // 这里只记录调用过的 URL，供自检断言"只拉起了一次、且用的是 verification_uri"。
  openExternalCalls: [],
  async openExternal(url) {
    shell.openExternalCalls.push(url)
  }
}

export class BrowserWindow {
  static getAllWindows() {
    return process.env.WINDOW_MODE === 'present' ? [{ fakeParentWindow: true }] : []
  }
}

export const dialog = {
  lastArgCount: 0,
  async showOpenDialog(...args) {
    dialog.lastArgCount = args.length
    const dialogMode = process.env.DIALOG_MODE ?? 'cancel'
    if (dialogMode.startsWith('pick:')) return { canceled: false, filePaths: [dialogMode.slice(5)] }
    return { canceled: true, filePaths: [] }
  }
}
