// auth.ts 的打桩自检：脱离 Electron 直接跑完整的设备流状态机。
//
// 跑法：node scripts/selfcheck/auth.mjs
//   （驱动器用 esbuild 打包本文件，把 electron 打桩成 scripts/selfcheck/electron-stub.mjs，
//     再按 SCENARIO 起多个子进程：有的验状态机，有的验跨进程的 token 落盘/清除。）
//
// 之所以要假 fetch：设备流全程就是在跟 GitHub 来回说话，不把 fetch 换掉就只能连真实
// GitHub——那既跑不快（interval 最小 5 秒），也没法稳定复现 slow_down / expired /
// access_denied 这些分支。假 fetch 用的是**真实的 Response 对象**，所以 auth.ts 里
// res.ok / res.json() 的路径是真的在跑，不是被绕过。
//
// 本自检不接入 CI，与其它自检一致。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { shell } from './electron-stub.mjs'
import * as auth from '../../src/main/auth'
import * as store from '../../src/main/store'
import type { LoginOutcome } from '@shared/types'

let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

function finish(): void {
  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

// ============================================================
// 假 fetch
// ============================================================

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'

type Json = Record<string, unknown>
/** callIndex 从 1 开始：用来写"第 1 次 pending、第 2 次成功"这类脚本 */
type Handler = (params: URLSearchParams, callIndex: number) => Json

const calls = { deviceCode: 0, token: 0, user: 0 }
/**
 * 累计统计"有多少个请求漏了 JSON 的 Accept 头"。
 * 漏了的话 GitHub 会回 form 编码，auth.ts 里的 .json() 直接炸——这是最难从症状
 * 反推回原因的一类 bug，所以单独盯住。
 * 注意两种媒体类型都算数：OAuth 端点用 application/json，
 * REST API（/user）用的是 GitHub 推荐的 application/vnd.github+json。
 */
let requestsWithoutJsonAccept = 0

function notSet(what: string): Handler {
  return () => {
    throw new Error(`自检没给 ${what} 设置路由`)
  }
}

let routes: { deviceCode: Handler; token: Handler; user: Handler } = {
  deviceCode: notSet('deviceCode'),
  token: notSet('token'),
  user: notSet('user')
}

/** 各个端点回什么 HTTP 状态码。默认 200——设备流的错误正常就是 200 + { error } 回来的。 */
const statuses = { deviceCode: 200, token: 200, user: 200 }

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function installFakeFetch(): void {
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (!(headers.get('accept') ?? '').includes('json')) {
      requestsWithoutJsonAccept += 1
    }
    const raw = init?.body
    const params = raw instanceof URLSearchParams ? raw : new URLSearchParams()

    if (url === DEVICE_CODE_URL) {
      calls.deviceCode += 1
      return json(routes.deviceCode(params, calls.deviceCode), statuses.deviceCode)
    }
    if (url === TOKEN_URL) {
      calls.token += 1
      return json(routes.token(params, calls.token), statuses.token)
    }
    if (url === USER_URL) {
      calls.user += 1
      return json(routes.user(params, calls.user), statuses.user)
    }
    // 不认识的 URL 直接炸：宁可让自检失败，也不要静默放过一个写错的端点常量
    throw new Error(`假 fetch 收到了未预期的 URL：${url}`)
  }
}

const DEVICE_OK: Handler = () => ({
  device_code: 'device-code-1',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 1
})

const USER_OK: Handler = () => ({
  login: 'octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  name: 'The Octocat'
})

const PENDING: Handler = () => ({ error: 'authorization_pending' })

/** 所有成功路径都存同一个值，这样跨进程那条断言才有确定的期望值 */
const TOKEN_VALUE = 'gho_test_token'
const SUCCESS: Handler = () => ({ access_token: TOKEN_VALUE })

function reset(): void {
  calls.deviceCode = 0
  calls.token = 0
  calls.user = 0
  shell.openExternalCalls.length = 0
  statuses.deviceCode = 200
  statuses.token = 200
  statuses.user = 200
  routes = { deviceCode: DEVICE_OK, token: PENDING, user: USER_OK }
}

// ============================================================
// 场景驱动
// ============================================================

async function runFlow(opts: {
  token: Handler
  deviceCode?: Handler
  user?: Handler
  expiresIn?: number
}): Promise<{ outcome: LoginOutcome; elapsed: number }> {
  reset()
  const expiresIn = opts.expiresIn ?? 900
  routes.deviceCode =
    opts.deviceCode ??
    ((params, index) => ({ ...DEVICE_OK(params, index), expires_in: expiresIn, interval: 1 }))
  routes.token = opts.token
  routes.user = opts.user ?? USER_OK

  const started = Date.now()
  await auth.startDeviceFlow()
  const outcome = await auth.waitForLogin()
  return { outcome, elapsed: Date.now() - started }
}

function dbPath(): string {
  const file = process.env.MOCK_MODE === 'true' ? 'starpilot.mock.db.json' : 'starpilot.db.json'
  return join(app.getPath('userData'), file)
}

// ============================================================
// 主场景：状态机的每一条分支
// ============================================================

async function runMain(): Promise<void> {
  // ---- 没有进行中的流程：必须返回 expired，而不是抛错 ----
  // （这条只能放在最前面：一旦跑过任何一次 start，flow 就不再是 null 了）
  const orphan = await auth.waitForLogin()
  check('wait-without-flow 返回 expired 且不抛错', orphan.status === 'expired', orphan.status)

  // ---- 正常路径 ----
  const ok = await runFlow({
    token: (params, i) => (i === 1 ? { error: 'authorization_pending' } : SUCCESS(params, i))
  })
  check('pending-success 收敛为 success', ok.outcome.status === 'success', JSON.stringify(ok.outcome))
  check(
    'pending-success 带回了 user（不是把 token 送给前端）',
    ok.outcome.status === 'success' &&
      ok.outcome.user.login === 'octocat' &&
      ok.outcome.user.avatar_url !== null &&
      !JSON.stringify(ok.outcome).includes(TOKEN_VALUE),
    JSON.stringify(ok.outcome)
  )
  check(
    'pending-success 只拉起一次浏览器且用的是 verification_uri',
    shell.openExternalCalls.length === 1 && shell.openExternalCalls[0] === 'https://github.com/login/device',
    JSON.stringify(shell.openExternalCalls)
  )
  check('pending-success 第一次 pending 后继续轮询（共 2 次）', calls.token === 2, String(calls.token))
  check('pending-success 把 token 存进了 store', (await store.hasToken()) === true)
  check('pending-success 存的是原文（能解回来）', (await store.getToken()) === TOKEN_VALUE)
  check('pending-success 取了一次用户信息', calls.user === 1, String(calls.user))

  // ---- slow_down：不是错误，只是要放慢 ----
  const slow = await runFlow({
    token: (params, i) => (i === 1 ? { error: 'slow_down' } : SUCCESS(params, i))
  })
  check('slow_down 不被当成错误，最终仍成功', slow.outcome.status === 'success', slow.outcome.status)
  check('slow_down 把轮询间隔加了 5 秒（耗时 ≥6s）', slow.elapsed >= 6000, `${slow.elapsed}ms`)

  // ---- 有效期到期：expires_in 只有 2 秒，不能被 900 秒的兜底拖住 ----
  const exp = await runFlow({ expiresIn: 2, token: PENDING })
  check('expires_in 到期收敛为 expired', exp.outcome.status === 'expired', exp.outcome.status)
  check('expired 在 5 秒内收敛', exp.elapsed < 5000, `${exp.elapsed}ms`)

  // ---- GitHub 文档自相矛盾的别名 ----
  const alias = await runFlow({ token: () => ({ error: 'token_expired' }) })
  check('token_expired 别名同样判为 expired', alias.outcome.status === 'expired', alias.outcome.status)

  // ---- 用户在浏览器里点了 Cancel ----
  const denied = await runFlow({ token: () => ({ error: 'access_denied' }) })
  check('access_denied 判为 cancelled', denied.outcome.status === 'cancelled', denied.outcome.status)

  // ---- OAuth App 没勾 Enable Device Flow（token 端点）----
  const disabled = await runFlow({ token: () => ({ error: 'device_flow_disabled' }) })
  check('token 端点的 device_flow_disabled 判为 error', disabled.outcome.status === 'error', disabled.outcome.status)
  check(
    '错误信息提示去勾 Enable Device Flow',
    disabled.outcome.status === 'error' && disabled.outcome.message.includes('Enable Device Flow'),
    disabled.outcome.status === 'error' ? disabled.outcome.message : ''
  )

  // ---- 同一个错误出现在 device-code 端点：应当直接抛，且一次 token 轮询都不该发生 ----
  reset()
  routes.deviceCode = () => ({ error: 'device_flow_disabled' })
  let thrown = ''
  try {
    await auth.startDeviceFlow()
  } catch (err) {
    thrown = err instanceof Error ? err.message : String(err)
  }
  check('device-code 端点的 device_flow_disabled 直接抛错', thrown.includes('Enable Device Flow'), thrown)
  check('发起阶段就失败时没有去轮询 token', calls.token === 0, String(calls.token))

  // ---- 同一个错误也可能是 HTTP 400 回来的：不能退化成「GitHub 返回 HTTP 400」 ----
  // （有资料说 app 没启用 Device Flow 时 /login/device/code 直接回 400，所以两种形态都得认）
  reset()
  statuses.deviceCode = 400
  routes.deviceCode = () => ({ error: 'device_flow_disabled' })
  thrown = ''
  try {
    await auth.startDeviceFlow()
  } catch (err) {
    thrown = err instanceof Error ? err.message : String(err)
  }
  check('HTTP 400 形态的 device_flow_disabled 给的是同一句人话', thrown.includes('Enable Device Flow'), thrown)

  reset()
  statuses.token = 400
  routes.token = () => ({ error: 'device_flow_disabled' })
  await auth.startDeviceFlow()
  const status400 = await auth.waitForLogin()
  check(
    'token 端点 400 形态同样给同一句人话',
    status400.status === 'error' && status400.message.includes('Enable Device Flow'),
    JSON.stringify(status400)
  )

  // ---- 真·HTTP 故障（没有 error 字段）才该走重试，且重试到上限后收敛 ----
  // 注意不能走 runFlow：它内部会 reset()，把这里设的 statuses 又抹回 200
  reset()
  statuses.token = 503
  routes.token = () => ({ message: 'server error' })
  await auth.startDeviceFlow()
  const down = await auth.waitForLogin()
  check(
    '多次 5xx 后收敛为 error 并说明重试了多少次',
    down.status === 'error' && down.message.includes('已重试 5 次'),
    JSON.stringify(down)
  )
  check('5xx 确实重试了 5 次', calls.token === 5, String(calls.token))

  // ---- 200 但不认识：既没有 access_token 也没有 error，不能静默当成功 ----
  reset()
  routes.token = () => ({ message: '什么奇怪的东西' })
  await auth.startDeviceFlow()
  const weird = await auth.waitForLogin()
  check(
    '200 但既无 token 也无 error → 报未知错误而不是静默成功',
    weird.status === 'error' && weird.message.includes('unknown_error'),
    JSON.stringify(weird)
  )

  // ---- 取消 ----
  reset()
  await auth.startDeviceFlow()
  // 等第一次轮询真的跑起来，确认取消发生在 polling 阶段（而不是 exchanging 那个 no-op 分支）
  await sleep(300)
  auth.cancelDeviceFlow()
  const cancelled = await auth.waitForLogin()
  check('cancel 收敛为 cancelled', cancelled.status === 'cancelled', cancelled.status)
  let repeatThrew = ''
  try {
    auth.cancelDeviceFlow()
  } catch (err) {
    repeatThrew = String(err)
  }
  check('重复 cancel 是无害的 no-op', repeatThrew === '', repeatThrew)
  const afterCancel = await auth.waitForLogin()
  check('取消之后再 wait 仍返回 cancelled', afterCancel.status === 'cancelled', afterCancel.status)
  check('取消不会把上一次登录的状态搞丢', (await store.hasToken()) === true)

  // ---- 双击登录：必须复用同一份设备流 ----
  reset()
  const first = await auth.startDeviceFlow()
  const second = await auth.startDeviceFlow()
  check('double-start 返回同一个 userCode', first.userCode === second.userCode, `${first.userCode} / ${second.userCode}`)
  check('double-start 只请求了一次 device code', calls.deviceCode === 1, String(calls.deviceCode))
  check('double-start 只打开了一次浏览器', shell.openExternalCalls.length === 1, String(shell.openExternalCalls.length))
  auth.cancelDeviceFlow()
  await auth.waitForLogin()

  // ---- 渲染进程 reload 后靠 pending 恢复 UI ----
  reset()
  const info = await auth.startDeviceFlow()
  const state = auth.getState()
  check('getState 在可用时 available=true 且 reason 为空', state.available === true && state.reason === null, JSON.stringify(state))
  check(
    'getState 在等待中暴露 pending',
    state.pending !== null && state.pending.userCode === info.userCode,
    JSON.stringify(state.pending)
  )
  check(
    'pending.expiresIn 是剩余秒数而不是原样的 900',
    state.pending !== null && state.pending.expiresIn <= 900 && state.pending.expiresIn > 800,
    String(state.pending?.expiresIn)
  )
  auth.cancelDeviceFlow()
  await auth.waitForLogin()
  check('流程结束后 pending 归 null', auth.getState().pending === null)

  // ---- 应用退出 ----
  reset()
  await auth.startDeviceFlow()
  auth.dispose()
  const disposed = await auth.waitForLogin()
  check('dispose 收敛为 cancelled（退出时不留悬挂定时器）', disposed.status === 'cancelled', disposed.status)

  check('全程每个请求都声明了 JSON 的 Accept 头', requestsWithoutJsonAccept === 0, String(requestsWithoutJsonAccept))

  finish()
}

// ============================================================
// 跨进程：token 落盘 → clearToken → 新进程确实读不到
// ============================================================

async function runVerifyPersisted(): Promise<void> {
  check('跨进程：上一个进程存下的 token 还在', (await store.hasToken()) === true)
  check('跨进程：能解出原文', (await store.getToken()) === TOKEN_VALUE)

  await store.clearToken()
  check('clearToken 后同进程 hasToken 为 false', (await store.hasToken()) === false)
  check('clearToken 后同进程 getToken 为 null', (await store.getToken()) === null)

  const raw = readFileSync(dbPath(), 'utf8')
  const parsed = JSON.parse(raw) as { token: string | null }
  const cipher = Buffer.from(`key-A:${TOKEN_VALUE}`, 'utf8').toString('base64')
  check('clearToken 后磁盘上的密文也没了', parsed.token === null && !raw.includes(cipher), raw.slice(0, 160))

  finish()
}

async function runVerifyCleared(): Promise<void> {
  check('跨进程：clearToken 之后新进程读不到 token', (await store.hasToken()) === false)
  check('跨进程：getToken 返回 null', (await store.getToken()) === null)
  const parsed = JSON.parse(readFileSync(dbPath(), 'utf8')) as { token: string | null }
  check('跨进程：磁盘上确实写成了 null', parsed.token === null)
  finish()
}

// ============================================================
// 不可用场景
// ============================================================

async function expectUnavailable(label: string, reasonHint: string): Promise<void> {
  const state = auth.getState()
  check(`${label}：available 为 false`, state.available === false, JSON.stringify(state))
  check(`${label}：给出 reason`, (state.reason ?? '').length > 0, String(state.reason))
  check(`${label}：pending 为 null`, state.pending === null)
  if (reasonHint) {
    check(`${label}：reason 指到了正确的地方`, (state.reason ?? '').includes(reasonHint), String(state.reason))
  }
  let thrown = ''
  try {
    await auth.startDeviceFlow()
  } catch (err) {
    thrown = err instanceof Error ? err.message : String(err)
  }
  check(`${label}：startDeviceFlow 抛错`, thrown.length > 0, thrown)
  check(`${label}：没有发起任何网络请求`, calls.deviceCode === 0 && calls.token === 0)
  finish()
}

function runMockUnavailable(): Promise<void> {
  return expectUnavailable('mock-unavailable', 'Mock')
}

function runNoClientId(): Promise<void> {
  return expectUnavailable('no-client-id', 'GITHUB_OAUTH_CLIENT_ID')
}

// ============================================================
// 入口
// ============================================================

async function main(): Promise<void> {
  installFakeFetch()
  const scenario = process.env.SCENARIO ?? 'main'
  console.log(`== 场景：${scenario} MOCK_MODE=${process.env.MOCK_MODE} CLIENT_ID=${process.env.GITHUB_OAUTH_CLIENT_ID || '(空)'} ==\n`)

  switch (scenario) {
    case 'main':
      return runMain()
    case 'verify-persisted':
      return runVerifyPersisted()
    case 'verify-cleared':
      return runVerifyCleared()
    case 'mock-unavailable':
      return runMockUnavailable()
    case 'no-client-id':
      return runNoClientId()
    default:
      check(`未知场景 ${scenario}`, false)
      finish()
      return
  }
}

main().catch((err: unknown) => {
  console.error('自检自身出错：', err)
  process.exit(1)
})
