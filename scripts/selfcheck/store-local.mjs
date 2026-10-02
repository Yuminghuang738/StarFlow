// store.ts / local.ts 自检的统一驱动器。
// 负责用 esbuild 把 TS 入口打成 ESM bundle（electron 走打桩），再按场景把子进程跑起来。
//
// 用法：
//   node scripts/selfcheck/store-local.mjs             打桩自检：无 keyring / 有 keyring 两个场景
//                                                      （每个场景跑完会再用**另一个进程**复查一次 token）
//   node scripts/selfcheck/store-local.mjs real        真机自检：真实 Electron + 真实 safeStorage
//   node scripts/selfcheck/store-local.mjs clone       真实 clone（需要能访问 github.com）
//   node scripts/selfcheck/store-local.mjs e2e         端到端（mock）：构建产物 + CDP 驱动渲染进程
//   node scripts/selfcheck/store-local.mjs e2e-clone   端到端 + 真实 clone
//
// 产物统一放 out/selfcheck/（已 gitignore），不污染仓库。本脚本不接入 CI。
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFakeGitHome } from './fake-git-home.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = join(here, '..', '..')
const outDir = join(projectRoot, 'out', 'selfcheck')
const electronCli = join(projectRoot, 'node_modules', 'electron', 'cli.js')

const mode = process.argv[2] ?? 'stub'

/** 把 TS 入口打成 ESM bundle。
 *  stubElectron=true 时把 electron 换成 scripts/selfcheck/electron-stub.mjs；
 *  真机自检必须传 false —— 否则「真实 Electron」里跑的还是那个只有 getPath 的假 app。 */
async function bundle(entry, outfile, { stubElectron = true } = {}) {
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, outfile)
  const alias = { '@shared': join(projectRoot, 'src', 'shared') }
  if (stubElectron) alias.electron = join(here, 'electron-stub.mjs')
  await build({
    entryPoints: [join(here, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    // 不能省：否则 dotenv 那类 CJS 动态 require 会让 ESM 打包直接失败。
    packages: 'external',
    alias,
    logLevel: 'warning'
  })
  return out
}

/** 跑一个子进程，实时转发输出并捕获，返回退出码。用于会自己退出的子进程。 */
function run(args, env = process.env, bin = process.execPath, timeoutMs = 300000) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: projectRoot, env, stdio: 'inherit' })
    // 兜底：任何子进程卡住都不该让驱动器无限等下去。
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

/** 跑子进程并按**输出里的成功标记**判定结果，拿到结论就结束子进程。
 *  专供真机自检：本机沙箱里 Electron 主进程跑完不退出（app.exit / process.exit 都拦不住），
 *  退出码不可信，但自检结论已经完整打在输出里。返回 0/1。 */
function runUntil(args, env, marker, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const onData = (d) => {
      const text = String(d)
      output += text
      process.stdout.write(text)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      resolve(output.includes(marker) ? 0 : 1)
    }
    const timer = setTimeout(settle, timeoutMs)
    // close 会等 stdio 流关闭，比 exit 更不容易漏掉尾部输出。
    child.on('close', settle)
    child.on('error', settle)
  })
}

// ⚠️ 某些环境（含本机沙箱）会注入 ELECTRON_RUN_AS_NODE=1，让 electron.exe 退化成普通 node，
// require('electron') 只返回一个路径字符串 —— 真机自检会整体失真。必须剔除。
function electronEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  return env
}

/** 拦截式网络（TLS 中间人代理）下给 git 放宽证书校验。
 *  simple-git 会剥掉所有 GIT_ 前缀的环境变量，只能让它读一份临时 global config，
 *  不动用户真实的 ~/.gitconfig。平台相关的键在 fake-git-home.mjs 里。 */
function ensureFakeHome() {
  return writeFakeGitHome(join(outDir, 'fakehome'))
}

async function runStub() {
  const out = await bundle('store-local-entry.ts', 'store-local-bundle.mjs')
  // 第二个入口：同一个数据目录，换一个进程再查一次 token 还在不在。
  const restart = await bundle('store-local-token-restart.ts', 'store-local-token-restart-bundle.mjs')
  const scenarios = [
    // expect 是"重启后应当拿到什么"：无 keyring → 什么都没有（(c) 的核心）；有 keyring → 原样解回。
    { id: 'stub-nokeyring', keyring: 'none', expect: '' },
    { id: 'stub-keyring', keyring: 'available', expect: 'test-token-123' }
  ]
  let failed = 0
  for (const s of scenarios) {
    // 固定 RUN_ID 保证可复现，跑前清掉上一轮的库文件（否则播种断言会因为残留数据失败）。
    rmSync(join(outDir, 'data', s.id), { recursive: true, force: true })
    console.log(`\n######## 场景 ${s.id}（SAFESTORAGE_MODE=${s.keyring}）########`)
    const code = await run([out], {
      ...process.env,
      RUN_ID: s.id,
      MOCK_MODE: 'true',
      SAFESTORAGE_MODE: s.keyring
    })
    if (code !== 0) failed++

    // 必须紧接着本场景跑，且必须复用同一个 RUN_ID（同一个库文件）——
    // 这里唯一变的就是"进程换了"，这正是方案 (c) 与 (a) 的唯一区别所在。
    console.log(`\n######## 场景 ${s.id}：跨进程复查（换进程，同一数据目录）########`)
    const restartCode = await run([restart], {
      ...process.env,
      RUN_ID: s.id,
      MOCK_MODE: 'true',
      SAFESTORAGE_MODE: s.keyring,
      EXPECT_TOKEN: s.expect,
      SCENARIO: s.id
    })
    if (restartCode !== 0) failed++
  }
  return failed
}

/** 各 runner 统一返回「失败场景数」（0 / 1），别把进程退出码当计数打印。 */
const asFailure = (code) => (code === 0 ? 0 : 1)

async function runReal() {
  // 真机：不打桩，让 bundle 里的 import 'electron' 落到真实 Electron 上。
  const out = await bundle('store-local-real-entry.ts', 'store-local-real-bundle.mjs', { stubElectron: false })
  console.log('\n######## 真机：真实 Electron + 真实 safeStorage ########')
  // 这个入口不需要 --user-data-dir：store-local-real-entry.ts 自己就 mkdtemp 后
  // app.setPath('userData', ...)，而且 setPath 在启动之后跑，命令行开关压不过它。
  return asFailure(
    await runUntil([electronCli, out], electronEnv({ MOCK_MODE: 'true' }), '== 真实 Electron 全部通过 ==')
  )
}

async function runClone() {
  const out = await bundle('store-local-clone.ts', 'store-local-clone-bundle.mjs')
  // 每次跑前清掉上次的克隆产物，否则「目标目录已存在」那条断言会被残留目录带偏。
  // 清完必须重建：local.clone 的前置校验要求目标父目录存在（这正是 B2A 在测的行为）。
  const harness = join(outDir, 'clonetest-harness')
  rmSync(harness, { recursive: true, force: true })
  mkdirSync(harness, { recursive: true })
  console.log('\n######## 真实 clone（需要能访问 github.com）########')
  return asFailure(await run([out], { ...process.env, MOCK_MODE: 'false', HOME: ensureFakeHome() }))
}

async function runE2E(realClone) {
  if (realClone) {
    ensureFakeHome()
    rmSync(join(outDir, 'e2e-realclone'), { recursive: true, force: true })
  }
  const script = join(here, realClone ? 'store-local-e2e-realclone.mjs' : 'store-local-e2e.mjs')
  console.log(`\n######## 端到端（${realClone ? '真实 clone' : 'mock'}）########`)
  return asFailure(await run([script]))
}

const runners = {
  stub: runStub,
  real: runReal,
  clone: runClone,
  e2e: () => runE2E(false),
  'e2e-clone': () => runE2E(true)
}

const runner = runners[mode]
if (!runner) {
  console.log(`未知模式：${mode}`)
  console.log('可用：stub（默认）| real | clone | e2e | e2e-clone')
  process.exit(2)
}

const failed = await runner()
console.log(`\n== 驱动器汇总：${failed === 0 ? '全部通过' : `${failed} 项失败`} ==`)
process.exit(failed === 0 ? 0 : 1)
