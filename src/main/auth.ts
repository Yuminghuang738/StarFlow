// GitHub OAuth Device Flow 登录
//
// 为什么是 Device Flow 而不是 Loopback Web Flow：Device Flow 不需要 client_secret
// （GitHub 官方文档原话："The client_secret is not needed for the device flow"），
// 而 Loopback 至今把 client_secret 标为 Required——那意味着要么把密钥编进应用
// （公开仓库不可接受），要么自建一个转发后端。代价只是用户多粘一次 8 位码。
//
// ⚠️ 三条容易写错的地方，改这个文件前先读：
//   1. 设备流的错误是 HTTP 200 + { "error": "..." } 返回的，绝不能按 HTTP 状态码判断
//   2. 每个请求都要 Accept: application/json，否则 GitHub 回 form 编码，.json() 直接炸
//   3. 等待中的 Promise 只 resolve 不 reject——取消 / 超时 / 失败都是正常结局，
//      会经由 LoginOutcome 的 data 分支回到前端；一旦 reject，前端的 unwrap()
//      会把它当成 IPC 故障弹一条错误的 toast

import { shell } from 'electron'
import type { AuthState, AuthUser, DeviceFlowInfo, LoginOutcome } from '@shared/types'
import { getEnv, isMockMode } from './config'
import { saveToken } from './store'

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'

/** 与 README 里手填 PAT 需要的 scope 保持一致：public_repo 管 unstar / fork，read:user 管读 Star 列表 */
const SCOPE = 'read:user public_repo'
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
/** GitHub 要求 slow_down 后把轮询间隔至少加 5 秒 */
const SLOW_DOWN_STEP_SEC = 5
/** 瞬时网络抖动的重试次数：一次抖动不该杀掉一个用户已经等了十分钟的流程 */
const MAX_NET_RETRIES = 5
const USER_AGENT = 'StarFlow'

interface PendingFlow {
  deviceCode: string
  userCode: string
  verificationUri: string
  /** 绝对时间戳，而不是秒数：渲染进程 reload 后恢复 UI 时要接着倒数 */
  deadlineAt: number
  /** 会随 slow_down 变大 */
  intervalSec: number
  netRetries: number
  /** exchanging = 已经拿到 token、正在写盘。这个阶段不接受取消 */
  phase: 'polling' | 'exchanging'
  settled: boolean
  settledOutcome: LoginOutcome | null
  pollTimer: ReturnType<typeof setTimeout> | null
  expiryTimer: ReturnType<typeof setTimeout> | null
  resolve: (o: LoginOutcome) => void
  wait: Promise<LoginOutcome>
}

// 最近一次设备流。settled 之后**不置 null**：waitForLogin / getState 还要靠它
// 回答"上一次到底怎么了"，置 null 会让这两个调用误报成"没有流程"。
let flow: PendingFlow | null = null

// ============================================================
// 小工具
// ============================================================

function msgOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function clientId(): string {
  return getEnv().githubOauthClientId.trim()
}

/** 每次重算剩余秒数，不回显 GitHub 原始的 expires_in——reload 恢复后倒计时才接得上 */
function toInfo(f: PendingFlow): DeviceFlowInfo {
  return {
    userCode: f.userCode,
    verificationUri: f.verificationUri,
    expiresIn: Math.max(0, Math.ceil((f.deadlineAt - Date.now()) / 1000))
  }
}

/**
 * 幂等的收敛点：取消 / 成功 / 超时谁先到谁赢，后来的调用一律 no-op。
 * 只 resolve、从不 reject。
 */
function settle(f: PendingFlow, outcome: LoginOutcome): void {
  if (f.settled) return
  f.settled = true
  f.settledOutcome = outcome
  if (f.pollTimer) {
    clearTimeout(f.pollTimer)
    f.pollTimer = null
  }
  if (f.expiryTimer) {
    clearTimeout(f.expiryTimer)
    f.expiryTimer = null
  }
  // device code 是个凭证，终态之后没有理由继续留在内存里
  f.deviceCode = ''
  f.resolve(outcome)
}

// ============================================================
// HTTP
// ============================================================

/**
 * form 编码的 POST。用 URLSearchParams 而不是 JSON body：GitHub 的 OAuth 端点
 * 文档写的就是 form 参数，Accept 头负责让**响应**是 JSON。
 *
 * ⚠️ 先读 body、再判状态码。设备流的错误通常是 HTTP 200 + { "error": ... }，
 * 但也有 HTTP 400 的形态（例如 app 没启用 Device Flow）——如果在这里先按状态码抛，
 * 最该给出人话的那条错误就会退化成「GitHub 返回 HTTP 400」。
 */
async function postForm(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: new URLSearchParams(params)
  })

  let data: Record<string, unknown> | null = null
  try {
    const parsed: unknown = await res.json()
    if (typeof parsed === 'object' && parsed !== null) {
      data = parsed as Record<string, unknown>
    }
  } catch {
    // 响应体不是 JSON：交给下面的状态码分支给出可读的错误
  }

  // 认得出 error 字段就交给调用方按错误码分支，不关心它是 200 还是 400 回来的
  if (data && typeof data.error === 'string') return data

  if (!res.ok) {
    throw new Error(`GitHub 返回 HTTP ${res.status}`)
  }
  if (!data) {
    throw new Error('GitHub 返回了非预期的响应格式')
  }
  return data
}

async function fetchUser(token: string): Promise<AuthUser> {
  const res = await fetch(USER_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      // GitHub 的 /user 对没有 User-Agent 的请求会直接 403
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (!res.ok) {
    throw new Error(`GitHub 返回 HTTP ${res.status}`)
  }
  const data: unknown = await res.json()
  if (typeof data !== 'object' || data === null) {
    throw new Error('GitHub 返回了非预期的响应格式')
  }
  const obj = data as Record<string, unknown>
  return {
    login: asString(obj.login) ?? '',
    avatar_url: asString(obj.avatar_url),
    name: asString(obj.name)
  }
}

/** 设备码端点也会返回错误 JSON（例如 client id 不对） */
function deviceCodeErrorMessage(error: string): string {
  switch (error) {
    case 'device_flow_disabled':
      return '该 OAuth App 没有启用 Device Flow，请到 GitHub 的 OAuth App 设置里勾上 "Enable Device Flow"'
    case 'incorrect_client_credentials':
      return 'GITHUB_OAUTH_CLIENT_ID 不正确，请核对 .env 里的 Client ID'
    case 'unsupported_grant_type':
      return 'GitHub 不支持该授权类型（Device Flow 可能未对该应用开放）'
    default:
      return `发起设备流失败：GitHub 返回 ${error}`
  }
}

// ============================================================
// 轮询
// ============================================================

function schedulePoll(f: PendingFlow, delaySec: number): void {
  if (f.settled) return
  // 刻意用 setTimeout 链而不是 setInterval：slow_down 要动态改间隔
  f.pollTimer = setTimeout(() => {
    void poll(f)
  }, delaySec * 1000)
}

async function poll(f: PendingFlow): Promise<void> {
  if (f.settled || f.phase !== 'polling') return

  let data: Record<string, unknown>
  try {
    data = await postForm(TOKEN_URL, {
      client_id: clientId(),
      device_code: f.deviceCode,
      grant_type: GRANT_TYPE
    })
    f.netRetries = 0
  } catch (err) {
    f.netRetries += 1
    if (f.netRetries >= MAX_NET_RETRIES) {
      settle(f, {
        status: 'error',
        message: `轮询授权状态失败（已重试 ${MAX_NET_RETRIES} 次）：${msgOf(err)}`
      })
      return
    }
    console.warn(`[auth] 轮询出错，第 ${f.netRetries} 次重试：${msgOf(err)}`)
    schedulePoll(f, f.intervalSec)
    return
  }

  const token = asString(data.access_token)
  if (token) {
    // ⚠️ 必须在这里**重新**检查一次 settled：本函数开头那次检查在 await 之前，
    // 而用户点「取消」（或有效期到点）完全可能正好落在这条 POST 飞行的那几百毫秒里
    // ——cancelDeviceFlow 看到 phase 还是 'polling' 会放行，把流程 settle 成
    // cancelled / expired。不复查就直接往下走的话，token 照样落盘，于是出现
    // 「界面说已取消、其实已经登录了」：之后同步能成功、重启后徽章变成「已配置」，
    // 用户根本不知道中间发生了什么。而这正是 exchange() 里那句注释想消灭的矛盾。
    //
    // 选择丢弃而不是"补个成功"：用户说了取消就是取消，界面已经按取消收场了；
    // 要登录再点一次就是了，设备码每次都会重新发。
    if (f.settled) {
      console.warn('[auth] 授权已经完成，但流程在这期间被取消/过期了，丢弃拿到的 token')
      return
    }
    await exchange(f, token)
    return
  }

  // ⚠️ 走到这里说明是 HTTP 200 + { error } 的形态，只能按 error 字段分支
  const error = asString(data.error) ?? 'unknown_error'
  switch (error) {
    case 'authorization_pending':
      schedulePoll(f, f.intervalSec)
      return
    case 'slow_down':
      // 这不是错误，是 GitHub 在说"你轮询太快了"
      f.intervalSec += SLOW_DOWN_STEP_SEC
      console.log(`[auth] GitHub 要求放慢轮询，间隔改为 ${f.intervalSec} 秒`)
      schedulePoll(f, f.intervalSec)
      return
    // GitHub 文档的表头写 expired_token、正文写 token_expired，自相矛盾，两个都判
    case 'expired_token':
    case 'token_expired':
      settle(f, { status: 'expired' })
      return
    case 'access_denied':
      // 用户在浏览器里点了 Cancel，和主动取消是一回事
      settle(f, { status: 'cancelled' })
      return
    case 'incorrect_device_code':
      settle(f, { status: 'error', message: '设备码无效或已失效，请重新发起登录' })
      return
    case 'device_flow_disabled':
    case 'unsupported_grant_type':
    case 'incorrect_client_credentials':
      settle(f, { status: 'error', message: deviceCodeErrorMessage(error) })
      return
    default:
      settle(f, { status: 'error', message: `GitHub 返回了未知错误：${error}` })
  }
}

/** 拿到 token 之后：先落盘，再取用户信息 */
async function exchange(f: PendingFlow, token: string): Promise<void> {
  // ⚠️ 必须在第一个 await 之前**同步**翻转 phase：否则用户恰好在这期间点取消，
  // 就会先是 saveToken 写盘成功、再被 settle 成 cancelled，出现
  // "已经登录了却报已取消" 的矛盾状态。
  f.phase = 'exchanging'
  if (f.pollTimer) {
    clearTimeout(f.pollTimer)
    f.pollTimer = null
  }

  try {
    // 复用 issue #12 那套逻辑：有 keyring 就加密落盘，没有就只留内存
    await saveToken(token)
  } catch (err) {
    settle(f, { status: 'error', message: `Token 保存失败：${msgOf(err)}` })
    return
  }

  let user: AuthUser = { login: '', avatar_url: null, name: null }
  for (let attempt = 1; attempt <= MAX_NET_RETRIES; attempt += 1) {
    try {
      user = await fetchUser(token)
      break
    } catch (err) {
      if (attempt === MAX_NET_RETRIES) {
        // token 已经存下来了，授权本身是成功的——不能因为一个 GET 抖动就报登录失败，
        // 那会让界面显示"失败"而实际已登录。降级成一个空的 login，UI 只显示"已登录"。
        console.warn(`[auth] 取用户信息失败，已登录但拿不到用户名：${msgOf(err)}`)
        break
      }
      console.warn(`[auth] 取用户信息出错，第 ${attempt} 次重试：${msgOf(err)}`)
    }
  }

  settle(f, { status: 'success', user })
}

// ============================================================
// 对外接口
// ============================================================

/**
 * 当前的登录能力与进行中的设备流。渲染进程挂载时调用一次，用来决定展示
 * 哪一种 UI（不可用 / 等待中 / 未登录）。
 */
export function getState(): AuthState {
  if (isMockMode()) {
    return {
      available: false,
      reason: 'Mock 模式下不提供 GitHub 登录（假数据只由 mock.ts 提供，不在这里再造一套）',
      pending: null
    }
  }
  if (!clientId()) {
    return {
      available: false,
      reason: '未配置 GITHUB_OAUTH_CLIENT_ID，见 README「用 GitHub 登录」',
      pending: null
    }
  }
  return {
    available: true,
    reason: null,
    pending: flow && !flow.settled ? toInfo(flow) : null
  }
}

/**
 * 发起一次设备流。已经有一个没结束的流程时复用它（返回同一份 DeviceFlowInfo，
 * 不重新打开浏览器、不重启轮询），这样双击和 reload 后重点击都是幂等的。
 */
export async function startDeviceFlow(): Promise<DeviceFlowInfo> {
  const state = getState()
  if (!state.available) {
    throw new Error(state.reason ?? 'GitHub 登录当前不可用')
  }
  if (flow && !flow.settled) {
    console.log('[auth] 复用已有的设备流')
    return toInfo(flow)
  }

  const data = await postForm(DEVICE_CODE_URL, { client_id: clientId(), scope: SCOPE })

  const error = asString(data.error)
  if (error) {
    throw new Error(deviceCodeErrorMessage(error))
  }

  const deviceCode = asString(data.device_code)
  const userCode = asString(data.user_code)
  const verificationUri = asString(data.verification_uri)
  if (!deviceCode || !userCode || !verificationUri) {
    throw new Error('GitHub 没有返回完整的设备码信息，请稍后重试')
  }

  const expiresIn = asNumber(data.expires_in) ?? 900
  const intervalSec = Math.max(1, asNumber(data.interval) ?? 5)

  let resolveFn: (o: LoginOutcome) => void = () => {}
  const wait = new Promise<LoginOutcome>((resolve) => {
    resolveFn = resolve
  })

  const f: PendingFlow = {
    deviceCode,
    userCode,
    verificationUri,
    deadlineAt: Date.now() + expiresIn * 1000,
    intervalSec,
    netRetries: 0,
    phase: 'polling',
    settled: false,
    settledOutcome: null,
    pollTimer: null,
    expiryTimer: null,
    resolve: resolveFn,
    wait
  }
  flow = f

  // 有效期兜底：即使轮询一直没拿到终态，这个 Promise 也一定会收敛
  f.expiryTimer = setTimeout(() => {
    settle(f, { status: 'expired' })
  }, Math.max(0, f.deadlineAt - Date.now()))

  console.log(`[auth] 设备流已发起，验证码有效期 ${expiresIn} 秒，轮询间隔 ${intervalSec} 秒`)
  schedulePoll(f, f.intervalSec)

  try {
    // 必须 await：不 await 的话失败会变成 unhandled rejection
    await shell.openExternal(verificationUri)
  } catch (err) {
    // 打不开浏览器不致命——UI 上还有可点的链接和可复制的验证码
    console.warn(`[auth] 自动打开浏览器失败：${msgOf(err)}`)
  }

  return toInfo(f)
}

/**
 * 挂起等待用户在浏览器里完成授权，直到出现终态。
 * 没有进行中的流程时返回 expired 而**不抛错**——这个调用挂在 UI 的挂载流程上，
 * 抛错只会让前端 unwrap() 弹一条无意义的 toast。
 */
export async function waitForLogin(): Promise<LoginOutcome> {
  const f = flow
  if (!f) {
    console.warn('[auth] waitForLogin 在没有进行中的设备流时被调用')
    return { status: 'expired' }
  }
  if (f.settled) {
    return f.settledOutcome ?? { status: 'expired' }
  }
  return f.wait
}

/** 用户主动取消。重复调用、或在流程已经进入写盘阶段时调用，都是无害的 no-op。 */
export function cancelDeviceFlow(): void {
  const f = flow
  if (!f || f.settled) return
  if (f.phase === 'exchanging') {
    // 已经拿到 token、正在写盘：这时报「已取消」与事实不符，token 确实存下来了
    console.warn('[auth] 流程已进入写盘阶段，忽略取消')
    return
  }
  console.log('[auth] 用户取消登录')
  settle(f, { status: 'cancelled' })
}

/** 进程退出前清掉挂起的定时器，否则它们会在进程拆解期间触发。 */
export function dispose(): void {
  const f = flow
  if (!f || f.settled) return
  console.log('[auth] 应用退出，清理挂起的登录流程')
  settle(f, { status: 'cancelled' })
}
