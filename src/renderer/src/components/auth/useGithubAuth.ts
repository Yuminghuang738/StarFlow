import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthUser, DeviceFlowInfo, GithubViewer, LoginOutcome } from '@shared/types'
import { unwrap, ipcErrorMessage } from '../../lib/api'
import { pushToast } from '../common/Toast'

export type GithubAuthView = 'loading' | 'unavailable' | 'idle' | 'waiting' | 'loggedIn'

/**
 * 登录状态与四个动作。**从 GithubLoginCard 里原样搬出来的**（那批注释也一并搬），
 * 多一个实例的原因：侧边栏的账号块要能就地登录 / 退出，而设置页那张卡片已经有一套
 * 完整实现。两份设备流实现会各养一套坑——「不在事件处理里 await 挂 15 分钟的
 * waitForLogin」「挂载时要接回主进程里还挂着的 pending」「打包后 file:// 下
 * navigator.clipboard 可能是 undefined」——修了一处、另一处照旧，正是最难查的那种 bug。
 *
 * 三条容易踩的坑（改之前先读，它们都是真实踩过的）：
 *   1. waitForLogin 最长挂 15 分钟（设备码有效期）。**不能 await 在事件处理里**，
 *      否则按钮一直转圈；这里用 void 放出去，由 applyOutcome 统一收口。
 *   2. 渲染进程 reload 会丢掉挂起的 waitForLogin，但主进程的流程还活着
 *      （用户正在浏览器里操作）。所以挂载时要用 getState().pending 把等待重新接上。
 *   3. 打包后是 file:// 协议，navigator.clipboard 可能是 undefined。
 */
export interface GithubAuth {
  view: GithubAuthView
  /** view === 'unavailable' 时的原因（没配 Client ID / Mock 模式） */
  reason: string | null
  /** 本机存着凭据但这一次读不出（换机器 / 密钥环变更）。**不挡登录按钮**，登录正是出路 */
  tokenError: string | null
  pending: DeviceFlowInfo | null
  /** 已知的账号。登录成功那一刻来自 LoginOutcome，重启后来自 auth.getUser */
  user: AuthUser | null
  /** auth.getUser 的原始返回。三种"没拿到"在 reason/detail 里区分，交给调用方措辞 */
  viewer: GithubViewer | null
  /** auth.getUser 这条通道本身失败了（IPC 故障），与 viewer.reason === 'error' 是两回事 */
  viewerError: string | null
  busy: boolean
  /** 等待授权的截止时刻（本地算，不用 pending.expiresIn，那个是收到那一刻的快照） */
  deadline: number | null
  /** 每秒走一次的当前时间，供倒计时显示 */
  now: number
  start(): Promise<void>
  cancel(): Promise<void>
  logout(): Promise<void>
  copyCode(): Promise<void>
  /** 重新读一次登录状态。挂载时会自动调一次 */
  refresh(): Promise<void>
}

/**
 * 「认证状态变了」的订阅表。
 *
 * 设置页的登录卡片与侧边栏的账号块**同时存在**（页面是保活的，两边都会挂着）。
 * 没有这张表的话，一边登录/退出之后另一边照旧显示旧状态：侧边栏说「未登录」、
 * 设置页说「已登录 @xxx」，而事实只有一个。广播让所有实例重新问一次主进程，
 * 而不是互相传话——主进程才是权威。
 */
const listeners = new Set<() => void>()

function broadcastAuthChange(): void {
  for (const fn of listeners) fn()
}

export function useGithubAuth(): GithubAuth {
  const [view, setView] = useState<GithubAuthView>('loading')
  const [reason, setReason] = useState<string | null>(null)
  const [pending, setPending] = useState<DeviceFlowInfo | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [viewer, setViewer] = useState<GithubViewer | null>(null)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const alive = useRef(true)
  /** 每发起一次等待就 +1，用于丢弃过期的那一次（重复发起时只有最新的一次算数） */
  const waitSeq = useRef(0)
  /** 有等待在飞。refresh 看到它就不再重新推导视图（那条流程还在跑，别把它推回 idle） */
  const waiting = useRef(false)

  const applyOutcome = useCallback((outcome: LoginOutcome): void => {
    waiting.current = false
    setPending(null)
    setDeadline(null)

    if (outcome.status === 'success') {
      setUser(outcome.user)
      setView('loggedIn')
      // 新的 token 已经写进去了，之前那条"解不开"的告警随之作废
      setTokenError(null)
      // login 为空串是"授权成功但没能取到用户名"的降级路径，别显示成 "已登录 @"
      pushToast({
        type: 'success',
        message: outcome.user.login ? `已登录 ${outcome.user.login}` : '已登录 GitHub'
      })
      // 另一个实例（设置页卡片 / 侧边栏账号块）也得跟着变
      broadcastAuthChange()
      return
    }

    setView('idle')
    if (outcome.status === 'expired') {
      pushToast({ type: 'error', message: '登录已超时，请重新发起' })
    } else if (outcome.status === 'error') {
      pushToast({ type: 'error', message: outcome.message })
    }
    // cancelled：用户自己取消的（或在浏览器里点了 Cancel），不弹提示
  }, [])

  const waitForOutcome = useCallback(async (): Promise<void> => {
    const seq = (waitSeq.current += 1)
    try {
      const outcome = await unwrap(window.api.auth.waitForLogin())
      if (!alive.current || seq !== waitSeq.current) return
      applyOutcome(outcome)
    } catch {
      // unwrap 已经弹过 toast：这是 IPC 层的故障，不是"登录失败"
      if (!alive.current || seq !== waitSeq.current) return
      waiting.current = false
      setPending(null)
      setDeadline(null)
      setView('idle')
    }
  }, [applyOutcome])

  /** 用 token 现查一次账号。**裸调不 unwrap**：它有三种"没拿到"都在返回值里，不是错误 */
  const loadViewer = useCallback(async (): Promise<void> => {
    const res = await window.api.auth.getUser()
    if (!alive.current) return
    if (!res.ok) {
      setViewerError(res.error)
      return
    }
    setViewerError(null)
    setViewer(res.data)
    if (res.data.user !== null) {
      setUser(res.data.user)
    } else if (res.data.reason === 'no-token') {
      // 主进程说没 token，那之前记着的账号已经不作数了（比如别处退出了登录）
      setUser(null)
    }
    // reason 为 error / unavailable 时**保留**已知的 user：那仍然是"你登录过的账号"，
    // 只是这一次没能确认。把用户抹掉反而是在装作"你从没登录过"。
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    // 正在等授权时不去打扰：那条流程还活着，重新推导视图只会把它推回 idle
    if (waiting.current) return
    try {
      const state = await unwrap(window.api.auth.getState())
      if (!alive.current) return

      if (!state.available) {
        setReason(state.reason)
        setView('unavailable')
        return
      }
      setReason(null)

      // ⚠️ hasToken 要与上面的 getState 分开 catch：getState 失败是"读不到登录环境"，
      // 而 hasToken 失败有个明确的特例——本机存着一条 token 但这次解不开
      // （换机器 / 密钥环变更，见 main/store.ts）。那**不是**"读取登录状态失败"，
      // 它恰恰是唯一能就地解决问题的入口（重新登录写一条新的，覆盖掉解不开的那条）。
      // 所以照常显示未登录态 + 登录按钮，另把原因留在按钮上方。
      let hasToken = false
      try {
        hasToken = await unwrap(window.api.store.hasToken())
      } catch (err) {
        if (!alive.current) return
        setTokenError(ipcErrorMessage(err))
        setView('idle')
        return
      }
      if (!alive.current) return

      if (hasToken) {
        setTokenError(null)
        setView('loggedIn')
        void loadViewer()
        return
      }

      setViewer(null)
      // 没有 token 就是没有账号：别处退出登录之后，这边不能还挂着上一个用户名
      setUser(null)
      if (state.pending) {
        setPending(state.pending)
        setDeadline(Date.now() + state.pending.expiresIn * 1000)
        setNow(Date.now())
        setView('waiting')
        waiting.current = true
        void waitForOutcome()
        return
      }

      setView('idle')
    } catch {
      if (!alive.current) return
      setReason('读取登录状态失败，请查看应用日志')
      setView('unavailable')
    }
  }, [loadViewer, waitForOutcome])

  // 挂载：读一次状态 + 加入广播表（另一边登录/退出时自己也跟着刷新）
  useEffect(() => {
    alive.current = true
    listeners.add(refresh)
    void refresh()
    return () => {
      alive.current = false
      listeners.delete(refresh)
    }
  }, [refresh])

  // 等待中的时候每秒走一次，让剩余时间真的在往下掉
  useEffect(() => {
    if (view !== 'waiting' || deadline === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [view, deadline])

  const start = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const info = await unwrap(window.api.auth.startDeviceFlow())
      setPending(info)
      setDeadline(Date.now() + info.expiresIn * 1000)
      setNow(Date.now())
      setView('waiting')
      waiting.current = true
      // 刻意不 await：这个调用会挂到用户完成授权为止
      void waitForOutcome()
    } catch {
      // unwrap 已经弹过 toast 了
    } finally {
      setBusy(false)
    }
  }, [waitForOutcome])

  const cancel = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await unwrap(window.api.auth.cancelDeviceFlow())
      // 不在这里切视图：取消会让 waitForLogin 以 cancelled 收敛，走 applyOutcome 同一个出口，
      // 免得两个地方各改一次状态、谁先谁后说不清
    } catch {
      // unwrap 已经弹过 toast 了
    } finally {
      setBusy(false)
    }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await unwrap(window.api.store.clearToken())
      setUser(null)
      setViewer(null)
      setView('idle')
      // 凭据已经真的被清掉了（clearToken 失败会抛到这里之前），那条"解不开"的告警一并作废
      setTokenError(null)
      pushToast({ type: 'success', message: '已退出登录' })
      broadcastAuthChange()
    } catch {
      // unwrap 已经弹过 toast 了
    } finally {
      setBusy(false)
    }
  }, [])

  const copyCode = useCallback(async (): Promise<void> => {
    const code = pending?.userCode
    if (!code) return
    // 打包后走的是 file:// 协议，navigator.clipboard 在那里可能是 undefined，
    // 所以不能靠 try/catch 兜底——await undefined 不会抛错，会假装成功。
    if (!navigator.clipboard) {
      pushToast({ type: 'error', message: '当前环境不支持自动复制，请手动选中验证码' })
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      pushToast({ type: 'success', message: '验证码已复制' })
    } catch {
      pushToast({ type: 'error', message: '复制失败，请手动选中验证码' })
    }
  }, [pending])

  return {
    view,
    reason,
    tokenError,
    pending,
    user,
    viewer,
    viewerError,
    busy,
    deadline,
    now,
    start,
    cancel,
    logout,
    copyCode,
    refresh
  }
}
