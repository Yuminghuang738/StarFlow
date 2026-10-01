// local.ts「删除本地副本 + 磁盘对账」自检的驱动器：用 esbuild 把 local-manage-entry.ts
// 打成 ESM bundle（electron 与 simple-git 都走打桩），再按场景起子进程跑。
//
// 用法：node scripts/selfcheck/local-manage.mjs
//
// 两个场景：
//   main —— MOCK_MODE=false：store 的 clearClonedPath(s)、removeClone 的全部闸门、
//           listMissingCloneRecords 的父目录启发式
//   mock —— MOCK_MODE=true：闸门 5 换成"必须在 <downloads>/StarPilotDemo 之内"，
//           不是因为 mock 就跳过校验
//
// 两个场景刻意分进程：换模式要重建 lowdb 与 app.getPath 的结果，同进程里改
// process.env 也能跑，但那会依赖 isMockMode() 恰好惰性求值这个实现细节。
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
  const out = join(outDir, 'local-manage-bundle.mjs')
  await build({
    entryPoints: [join(here, 'local-manage-entry.ts')],
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
