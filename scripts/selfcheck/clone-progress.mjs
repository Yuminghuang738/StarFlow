// local.ts 克隆进度自检的驱动器：用 esbuild 把 clone-progress-entry.ts 打成 ESM bundle
// （electron 和 simple-git 都走打桩），再按场景起子进程跑。
//
// 用法：node scripts/selfcheck/clone-progress.mjs
//
// 两个场景：
//   main —— MOCK_MODE=false：进度记录的产生 / 透传 / 保活 / 并发隔离 / 失败保留，
//           以及两条前置校验（目录不存在、目标已存在）
//   mock —— MOCK_MODE=true：不产生进度记录，且 simpleGit 一次都不调
//
// 两个场景刻意分进程：「Mock 下不造假进度」是运行模式层面的保证，
// 同进程里改 process.env 也能测，但那会依赖 isMockMode() 恰好是惰性求值的实现细节。
//
// 产物在 out/selfcheck/ 下（已 gitignore）。本自检不接入 CI。
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = join(here, '..', '..')
const outDir = join(projectRoot, 'out', 'selfcheck')

async function bundle() {
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, 'clone-progress-bundle.mjs')
  await build({
    entryPoints: [join(here, 'clone-progress-entry.ts')],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    // 不能省：否则 dotenv 那类 CJS 动态 require 会让 ESM 打包直接失败。
    packages: 'external',
    // alias 优先于 packages: 'external'，所以这两个裸包名会被换成本地桩
    alias: {
      '@shared': join(projectRoot, 'src', 'shared'),
      electron: join(here, 'electron-stub.mjs'),
      'simple-git': join(here, 'simple-git-stub.mjs')
    },
    logLevel: 'warning'
  })
  return out
}

function run(args, env, timeoutMs = 60000) {
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

const scenarios = [
  { id: 'main', mock: 'false' },
  { id: 'mock', mock: 'true' }
]

const out = await bundle()
let failed = 0

for (const s of scenarios) {
  console.log(`\n######## 场景 ${s.id} ########`)
  const code = await run([out], { ...process.env, SCENARIO: s.id, MOCK_MODE: s.mock })
  if (code !== 0) failed += 1
}

console.log(`\n==== 驱动器汇总：${failed === 0 ? '全部通过' : failed + ' 个场景失败'} ====`)
process.exit(failed === 0 ? 0 : 1)
