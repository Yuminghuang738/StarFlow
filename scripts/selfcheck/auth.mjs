// auth.ts 自检的驱动器：用 esbuild 把 auth-entry.ts 打成 ESM bundle（electron 走打桩），
// 再按场景起子进程跑。
//
// 用法：node scripts/selfcheck/auth.mjs
//
// 场景分三组：
//   1. main             —— 单进程跑完状态机的每一条分支（成功 / slow_down / 到期 /
//                          别名 / access_denied / device_flow_disabled / 取消 /
//                          双击 / reload 恢复 / dispose），最后一个成功场景会留下 token
//   2. verify-persisted —— **换一个进程**、同一个数据目录：确认 token 真的落盘了，
//                          然后 clearToken()
//   3. verify-cleared   —— 再换一个进程：确认登出之后新进程读不到 token
//   （2、3 必须跨进程，否则证明不了"内存和磁盘都清了"——同进程内 hasToken 为 false
//     也可能只是内存被清了）
// 另外两组验不可用态：mock-unavailable / no-client-id。
//
// 产物在 out/selfcheck/ 下（已 gitignore）。本自检不接入 CI。
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = join(here, '..', '..')
const outDir = join(projectRoot, 'out', 'selfcheck')

async function bundle() {
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, 'auth-bundle.mjs')
  await build({
    entryPoints: [join(here, 'auth-entry.ts')],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    // 不能省：否则 dotenv 那类 CJS 动态 require 会让 ESM 打包直接失败。
    packages: 'external',
    alias: {
      '@shared': join(projectRoot, 'src', 'shared'),
      electron: join(here, 'electron-stub.mjs')
    },
    logLevel: 'warning'
  })
  return out
}

function run(args, env, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: projectRoot, env, stdio: 'inherit' })
    // 兜底：某个场景真卡住时不该让驱动器无限等下去
    const timer = setTimeout(() => {
      console.log(`\n[driver] 子进程超过 ${Math.round(timeoutMs / 1000)}s 未退出，强制结束`)
      child.kill()
    }, timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code ?? 1)
    })
  })
}

/** 主场景那一组共用同一个 RUN_ID：token 就是靠这个数据目录在进程之间传下去的 */
const SHARED = { RUN_ID: 'auth-main', MOCK_MODE: 'false', GITHUB_OAUTH_CLIENT_ID: 'test-client-id', SAFESTORAGE_MODE: 'available' }

const scenarios = [
  { id: 'main', env: SHARED, clean: true },
  { id: 'verify-persisted', env: SHARED },
  { id: 'verify-cleared', env: SHARED },
  {
    id: 'mock-unavailable',
    env: { RUN_ID: 'auth-mock', MOCK_MODE: 'true', GITHUB_OAUTH_CLIENT_ID: 'test-client-id' },
    clean: true
  },
  {
    id: 'no-client-id',
    env: { RUN_ID: 'auth-nocid', MOCK_MODE: 'false', GITHUB_OAUTH_CLIENT_ID: '' },
    clean: true
  }
]

const out = await bundle()
let failed = 0

for (const s of scenarios) {
  // 固定 RUN_ID 保证可复现。跑前清掉上一轮的库文件，否则残留的 token 会带偏断言。
  if (s.clean) {
    rmSync(join(outDir, 'data', s.env.RUN_ID), { recursive: true, force: true })
  }
  console.log(`\n######## 场景 ${s.id} ########`)
  const code = await run([out], { ...process.env, ...s.env, SCENARIO: s.id })
  if (code !== 0) failed += 1
}

console.log(`\n==== 驱动器汇总：${failed === 0 ? '全部通过' : failed + ' 个场景失败'} ====`)
process.exit(failed === 0 ? 0 : 1)
