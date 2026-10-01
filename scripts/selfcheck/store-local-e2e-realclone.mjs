// 端到端自检（真实分支）：MOCK_MODE=false + 真实 Electron + 真实 git，
// 在渲染进程里调 window.api.local.clone / openDir，走完整 IPC 链路。
// 跑法：node scripts/selfcheck/store-local.mjs e2e-clone
// 前置：先跑 npm run build；且本机能访问 github.com。
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { writeFakeGitHome } from './fake-git-home.mjs'

const PORT = 9335
const BASE = join(process.cwd(), 'out', 'selfcheck', 'e2e-realclone')
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

mkdirSync(BASE, { recursive: true })

// simple-git 出于安全会剥掉子进程环境里**所有** GIT_ 前缀的变量，所以没法用
// GIT_CONFIG_* 给 clone 注入配置（在 bash 里手跑 git clone 有效、在应用里必然无效）。
// 只能让 git 去读一份临时 global config —— 不动用户真实的 ~/.gitconfig。
// 平台相关的键写在 fake-git-home.mjs 里（写死 schannel 会让非 Windows 机器全红）。
const FAKE_HOME = writeFakeGitHome(join(process.cwd(), 'out', 'selfcheck', 'fakehome'))

const env = {
  ...process.env,
  MOCK_MODE: 'false',
  HOME: FAKE_HOME
}
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS

const child = spawn(
  process.execPath,
  [
    'node_modules/electron/cli.js',
    '.',
    `--remote-debugging-port=${PORT}`,
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--in-process-gpu'
  ],
  { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] }
)
const logs = []
child.stdout.on('data', (d) => logs.push(String(d)))
child.stderr.on('data', (d) => logs.push(String(d)))

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* 还没起来 */
    }
    await sleep(500)
  }
  return null
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    const resolve = pending.get(msg.id)
    if (resolve) {
      pending.delete(msg.id)
      resolve(msg)
    }
  })
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  const send = (method, params) =>
    new Promise((res) => {
      const mid = ++id
      pending.set(mid, res)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  return { ws, ready, send }
}

async function main() {
  const startedAt = Date.now()
  const page = await findPage()
  if (!page) {
    console.log('启动失败，主进程输出：\n' + logs.join(''))
    check('应用能启动并暴露渲染进程', false)
    child.kill()
    process.exit(1)
  }
  check('应用能启动（MOCK_MODE=false）', true, `${Date.now() - startedAt}ms`)

  const { ws, ready, send } = connect(page.webSocketDebuggerUrl)
  await ready
  await send('Runtime.enable')

  const async_ = async (expression) => {
    const msg = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (msg.result?.exceptionDetails) return { threw: true, text: msg.result.exceptionDetails.text }
    return msg.result?.result?.value
  }
  const unwrap = async (label, expression) => {
    const r = await async_(expression)
    if (r?.threw) {
      check(label, false, r.text)
      return null
    }
    return r
  }

  const hasApi = await unwrap('preload 暴露 window.api', 'typeof window.api')
  check('preload 暴露 window.api', hasApi === 'object', String(hasApi))

  // ---- 真实 clone：走 window.api → IPC → main → local.clone → simple-git ----
  const t0 = Date.now()
  const cloned = await unwrap(
    'IPC local:clone 真实克隆',
    `window.api.local.clone("octocat/Hello-World", ${JSON.stringify(BASE)}).then(r => r.ok ? r.data : {err: r.error})`
  )
  const cost = Date.now() - t0
  check('IPC local:clone 返回【完整绝对路径】', cloned === join(BASE, 'Hello-World'), String(cloned))
  check('IPC local:clone 是完整 git 仓库（.git 存在）', existsSync(join(BASE, 'Hello-World', '.git')))
  check('IPC local:clone 工作区已检出', existsSync(join(BASE, 'Hello-World', 'README')))
  console.log(`     端到端克隆耗时 ${cost}ms`)

  // ---- 真实第二次 clone：目标已存在 → 中文错误（经 IPC 变成 ok:false）----
  const dup = await unwrap(
    'IPC local:clone 重复克隆',
    `window.api.local.clone("octocat/Hello-World", ${JSON.stringify(BASE)}).then(r => r.ok ? {ok:true} : {ok:false, err: r.error})`
  )
  check(
    'IPC local:clone 重复克隆 → 中文错误「目标目录已存在」',
    dup?.ok === false && String(dup.err).includes('目标目录已存在'),
    JSON.stringify(dup)
  )

  // ---- openDir 真实目录 ----
  const opened = await unwrap(
    'IPC local:openDir 真实目录',
    `window.api.local.openDir(${JSON.stringify(join(BASE, 'Hello-World'))}).then(r => r.ok ? "ok" : r.error)`
  )
  check('IPC local:openDir 真实目录 → ok', opened === 'ok', String(opened))

  ws.close()
  child.kill()
  console.log(`\n== ${failures === 0 ? '端到端（真实 clone）全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.log('自检脚本异常:', err)
  child.kill()
  process.exit(1)
})
