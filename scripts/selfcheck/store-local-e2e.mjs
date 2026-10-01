// 端到端自检：启动**构建产物**（out/main/index.js），用 CDP 在渲染进程里调 window.api.*，
// 验证「应用能启动 + preload / IPC 链路通 + store/local 的 IPC 行为」。
// 跑法：node scripts/selfcheck/store-local.mjs e2e
// 前置：先跑 npm run build（本脚本验的是构建产物，不是源码）。
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import { join } from 'node:path'
import { freshProfileFlag } from './e2e-profile.mjs'

const PORT = 9333
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

const env = { ...process.env, MOCK_MODE: 'true' }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS

const extraFlags = (process.env.EXTRA_FLAGS ?? '').split(' ').filter(Boolean)
const child = spawn(
  process.execPath,
  // 这台机器的 GPU 进程会崩（受限沙箱），默认走 --in-process-gpu
  [
    'node_modules/electron/cli.js',
    '.',
    `--remote-debugging-port=${PORT}`,
    // 必须隔离 userData：本脚本会真写 token 与 updateLocalState，默认会打到
    // 开发者自己的 starflow.db.json 上（详见 e2e-profile.mjs）。顺带保证可重复。
    freshProfileFlag('e2e-mock'),
    '--no-sandbox',
    '--disable-gpu-sandbox',
    ...(extraFlags.length > 0 ? extraFlags : ['--in-process-gpu'])
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
  check('应用能启动（构建产物）', true, `${Date.now() - startedAt}ms, url=${page.url}`)

  const { ws, ready, send } = connect(page.webSocketDebuggerUrl)
  await ready
  await send('Runtime.enable')

  const async_ = async (expression) => {
    const msg = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (msg.result?.exceptionDetails) {
      return { threw: true, text: msg.result.exceptionDetails.text }
    }
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

  const repos = await unwrap(
    'IPC store:getRepos 返回种子列表',
    'window.api.store.getRepos().then(r => r.ok ? {n: r.data.length, first: r.data[0].full_name} : {err: r.error})'
  )
  check('IPC store:getRepos 返回 31 条', repos?.n === 31, JSON.stringify(repos))

  const hasTokenBefore = await unwrap(
    'IPC store:hasToken 初始为 false',
    'window.api.store.hasToken().then(r => r.data)'
  )
  check('IPC store:hasToken 初始 false', hasTokenBefore === false, String(hasTokenBefore))

  await unwrap('IPC store:saveToken', 'window.api.store.saveToken("test-token-123").then(r => r.ok)')
  const hasTokenAfter = await unwrap(
    'IPC store:hasToken 保存后为 true',
    'window.api.store.hasToken().then(r => r.data)'
  )
  check('IPC store:hasToken 保存后 true', hasTokenAfter === true, String(hasTokenAfter))

  const ghost = await unwrap(
    'IPC store:updateLocalState 不存在的仓库不报错',
    'window.api.store.updateLocalState("不存在的仓库", {cloned_path: "x"}).then(r => r.ok)'
  )
  check('IPC updateLocalState 未找到仓库仍 ok', ghost === true, String(ghost))

  const workDir = await unwrap(
    'IPC local:chooseDir（mock 演示目录）',
    'window.api.local.chooseDir().then(r => r.ok ? r.data : r.error)'
  )
  check('IPC local:chooseDir 返回目录', typeof workDir === 'string' && workDir.length > 0, String(workDir))

  const target = repos?.first

  // ⚠️ 克隆路径必须指向一个**真实存在**的目录，不能随便写个 /tmp/e2e。
  // 应用启动时渲染进程的 load() 末尾会跑一次 clone 对账（pruneLocalClones）：
  // 主进程把 cloned_path 指向、但磁盘上找不到、而**父目录在**的记录清掉
  // （local.listMissingCloneRecords 的判据就是这个）。/tmp 存在、/tmp/e2e 不存在，
  // 于是那条记录一定会被清——是否清在我们写之前，纯看两次 IPC 谁先到。
  // 这条断言以前就是这么红的（约 1/13），而且红得像"undefined 抹掉了值"，
  // 其实跟 undefined 毫无关系。现在用一个真的存在的目录，这条断言才是确定的。
  const clonePath = mkdtempSync(join(tmpdir(), 'sf-e2e-clone-'))
  const bogusPath = join(clonePath, 'definitely-not-here')

  await unwrap(
    'IPC updateLocalState 写 cloned_path',
    `window.api.store.updateLocalState(${JSON.stringify(target)}, {cloned_path: ${JSON.stringify(clonePath)}}).then(r => r.ok)`
  )
  await unwrap(
    'IPC updateLocalState 写 forked_full_name',
    `window.api.store.updateLocalState(${JSON.stringify(target)}, {forked_full_name: "me/e2e"}).then(r => r.ok)`
  )
  await unwrap(
    'IPC updateLocalState 传 undefined',
    `window.api.store.updateLocalState(${JSON.stringify(target)}, {cloned_path: undefined}).then(r => r.ok)`
  )
  const after = await unwrap(
    'IPC getRepos 读回 local 状态',
    `window.api.store.getRepos().then(r => r.data.find(x => x.full_name === ${JSON.stringify(target)}).local)`
  )
  check(
    'IPC 两个字段都在且 undefined 没抹掉值',
    after?.cloned_path === clonePath && after?.forked_full_name === 'me/e2e',
    JSON.stringify(after)
  )

  // 把上面那个原因直接钉成一条断言：对账**确实**会清掉"父目录在、自己不在"的记录。
  // 有这条，将来谁再往这里写一个不存在的路径，就有一处显式的说明告诉他为什么不行；
  // 也顺带证明了 pruneClones 这条 IPC 真的在工作（它平时是静默的，界面上看不见）。
  await unwrap(
    'IPC updateLocalState 写一个不存在的 cloned_path',
    `window.api.store.updateLocalState(${JSON.stringify(target)}, {cloned_path: ${JSON.stringify(bogusPath)}}).then(r => r.ok)`
  )
  const pruned = await unwrap(
    'IPC local:pruneClones 对账',
    'window.api.local.pruneClones().then(r => r.ok ? r.data : r.error)'
  )
  check(
    'IPC 对账清掉了磁盘上不存在的 cloned_path',
    Array.isArray(pruned) && pruned.includes(target),
    JSON.stringify(pruned)
  )
  const afterPrune = await unwrap(
    'IPC getRepos 读回对账后的状态',
    `window.api.store.getRepos().then(r => r.data.find(x => x.full_name === ${JSON.stringify(target)}).local)`
  )
  check(
    'IPC 对账只清 cloned_path，fork 标记保留',
    afterPrune?.cloned_path === undefined && afterPrune?.forked_full_name === 'me/e2e',
    JSON.stringify(afterPrune)
  )

  const clonedDir = await unwrap(
    'IPC local:clone（mock 分支原样）',
    `window.api.local.clone("vuejs/core", ${JSON.stringify(String(workDir))}).then(r => r.ok ? r.data : r.error)`
  )
  check('IPC local:clone 返回目标目录', clonedDir === join(String(workDir), 'core'), String(clonedDir))

  const badOpen = await unwrap(
    'IPC local:openDir 不存在的路径 → 中文错误',
    'window.api.local.openDir("C:/definitely/not/here").then(r => r.ok ? "ok" : r.error)'
  )
  check('IPC openDir 报「路径不存在」', String(badOpen).includes('路径不存在'), String(badOpen))

  const report = await unwrap(
    'IPC report:generate（mock 周报）',
    'window.api.report.generate().then(r => r.ok ? {week: !!r.data.weekStart, days: Object.keys(r.data.dailyStarCount).length, ai: String(r.data.aiSummary).length} : {err: r.error})'
  )
  check('IPC report:generate 返回完整周报', report?.week === true && report?.days === 7, JSON.stringify(report))

  ws.close()
  child.kill()
  // 这个目录是给 cloned_path 当"真实存在的克隆目录"用的，跑完就清掉。
  // 套 try：清理失败（杀进程时的占用之类）不该把一轮全绿的断言变成红的。
  try {
    rmSync(clonePath, { recursive: true, force: true })
  } catch {
    console.warn('[e2e] 临时克隆目录未能清理：', clonePath)
  }
  console.log(`\n== ${failures === 0 ? '端到端全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.log('自检脚本异常:', err)
  child.kill()
  process.exit(1)
})
