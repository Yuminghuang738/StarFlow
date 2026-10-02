import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthUser, DeviceFlowInfo, LoginOutcome } from '@shared/types'
import { unwrap, ipcErrorMessage } from '../../lib/api'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { pushToast } from '../common/Toast'

export interface GithubLoginCardProps {
  /** 登录 / 退出成功后回调，让设置页重新读一次 hasToken（PAT 状态徽章要跟着变） */
  onAuthChange?: () => void
}

type View = 'loading' | 'unavailable' | 'idle' | 'waiting' | 'loggedIn'

/**
 * GitHub OAuth Device Flow 登录块。用法见 prompts 与 README「用 GitHub 登录」。
 *
 * 状态全部留在本组件里，不往 repoStore 塞（RepoStore 是冻结契约，见
 * docs/renderer-contracts.md）。代价是刷新后只知道自己"已登录"、拿不到用户名，
 * 所以登录态刻意不显示 @login 也能正常渲染。
 *
 * 三条容易踩的坑，改之前先读：
 *   1. waitForLogin 最长挂 15 分钟（设备码有效期）。**不能 await 在事件处理里**，
 *      否则按钮一直转圈；这里用 void 放出去，由 applyOutcome 统一收口。
 *   2. 渲染进程 reload 会丢掉挂起的 waitForLogin，但主进程的流程还活着
 *      （用户正在浏览器里操作）。所以挂载时要用 getState().pending 把等待重新接上。
 *   3. 打包后是 file:// 协议，navigator.clipboard 可能是 undefined。
 *
 * 五个分支返回的根 Card **都不带 mt**：与上方区块的间距由所在页面的 PageContainer
 * 统一给（gap-5）。卡片自己带外边距，换个页面就会和容器的间距叠成两层。
 */
export function GithubLoginCard({ onAuthChange }: GithubLoginCardProps): React.JSX.Element {
  const [view, setView] = useState<View>('loading')
  const [reason, setReason] = useState<string | null>(null)
  const [pending, setPending] = useState<DeviceFlowInfo | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  /**
   * 「本机存着一条 Token，但这一次读不出它」（换机器 / 系统密钥环变更，见
   * main/store.ts 的 hasToken）——与「确实没配过」是两回事，但**都不该挡住登录按钮**。
   * 这里只把原因留在按钮上方，视图照常走未登录态。
   */
  const [tokenError, setTokenError] = useState<string | null>(null)

  // 倒计时用本地 deadline 自己算，而不是每秒钟去问一次主进程：
  // pending.expiresIn 是收到那一刻的剩余秒数，直接用会定格不动。
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const alive = useRef(true)
  /** 每发起一次等待就 +1，用于丢弃过期的那一次（重复发起时只有最新的一次算数） */
  const waitSeq = useRef(0)
  // onAuthChange 大多是父组件里的内联箭头函数，放进 effect 依赖会让等待被反复重建，
  // 所以走 ref。
  const onAuthChangeRef = useRef(onAuthChange)
  useEffect(() => {
    onAuthChangeRef.current = onAuthChange
  }, [onAuthChange])

  const applyOutcome = useCallback((outcome: LoginOutcome): void => {
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
      onAuthChangeRef.current?.()
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
      setPending(null)
      setDeadline(null)
      setView('idle')
    }
  }, [applyOutcome])

  // 挂载：读状态 → 已登录就直接显示 → 有挂起的流程就重新接上等待
  useEffect(() => {
    alive.current = true
    let cancelled = false

    void (async () => {
      try {
        const state = await unwrap(window.api.auth.getState())
        if (cancelled) return

        if (!state.available) {
          setReason(state.reason)
          setView('unavailable')
          return
        }

        // ⚠️ hasToken 要与上面的 getState 分开 catch：getState 失败是"读不到登录环境"，
        // 那张卡片无处可去（所以下面显示 unavailable）；而 hasToken 失败有个明确的
        // 特例——本机存着一条 token 但这次解不开（换机器 / 密钥环变更，见 main/store.ts）。
        // 那**不是**"读取登录状态失败"，把它并进 unavailable 会把这个卡片变成死胡同：
        // 它恰恰是唯一能就地解决问题的入口（重新登录写一条新的，覆盖掉解不开的那条）。
        // 所以照常显示未登录态 + 登录按钮，另把原因与出路留在按钮上方。
        // unwrap 已经弹过那条带原因的 toast，这里只需要把话说在界面上。
        let hasToken = false
        try {
          hasToken = await unwrap(window.api.store.hasToken())
        } catch (err) {
          if (cancelled) return
          setTokenError(ipcErrorMessage(err))
          setView('idle')
          return
        }
        if (cancelled) return
        if (hasToken) {
          setView('loggedIn')
          return
        }

        if (state.pending) {
          setPending(state.pending)
          setDeadline(Date.now() + state.pending.expiresIn * 1000)
          setNow(Date.now())
          setView('waiting')
          void waitForOutcome()
          return
        }

        setView('idle')
      } catch {
        if (cancelled) return
        setReason('读取登录状态失败，请查看应用日志')
        setView('unavailable')
      }
    })()

    return () => {
      cancelled = true
      alive.current = false
    }
  }, [waitForOutcome])

  // 等待中的时候每秒走一次，让剩余时间真的在往下掉
  useEffect(() => {
    if (view !== 'waiting' || deadline === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [view, deadline])

  async function start(): Promise<void> {
    setBusy(true)
    try {
      const info = await unwrap(window.api.auth.startDeviceFlow())
      setPending(info)
      setDeadline(Date.now() + info.expiresIn * 1000)
      setNow(Date.now())
      setView('waiting')
      // 刻意不 await：这个调用会挂到用户完成授权为止
      void waitForOutcome()
    } catch {
      // unwrap 已经弹过 toast 了
    } finally {
      setBusy(false)
    }
  }

  async function cancel(): Promise<void> {
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
  }

  async function logout(): Promise<void> {
    setConfirmLogout(false)
    setBusy(true)
    try {
      await unwrap(window.api.store.clearToken())
      setUser(null)
      setView('idle')
      // 凭据已经真的被清掉了（clearToken 失败会抛到这里之前），那条"解不开"的告警一并作废
      setTokenError(null)
      pushToast({ type: 'success', message: '已退出登录' })
      onAuthChangeRef.current?.()
    } catch {
      // unwrap 已经弹过 toast 了
    } finally {
      setBusy(false)
    }
  }

  async function copyCode(): Promise<void> {
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
  }

  if (view === 'loading') {
    return (
      <Card>
        <h2 className="text-sm font-medium text-fg">用 GitHub 登录</h2>
        <p className="mt-1 text-xs text-fg-subtle">正在检查登录状态…</p>
      </Card>
    )
  }

  if (view === 'unavailable') {
    return (
      <Card>
        <h2 className="text-sm font-medium text-fg">用 GitHub 登录</h2>
        <p className="mt-1 text-xs text-fg-subtle">{reason ?? '当前不可用'}</p>
      </Card>
    )
  }

  if (view === 'waiting') {
    const remaining = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))
    return (
      <Card>
        <h2 className="text-sm font-medium text-fg">等待授权</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          已自动打开浏览器。在 GitHub 页面里输入下面这串验证码并点 Authorize，
          这个页面会自己变成已登录。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <code className="select-all rounded-md border border-border-strong bg-surface-2 px-4 py-2 font-mono text-2xl tracking-widest text-primary">
            {pending?.userCode ?? ''}
          </code>
          <Button variant="ghost" size="sm" onClick={() => void copyCode()}>
            复制
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          剩余 {remaining} 秒 · 没打开浏览器的话，手动访问{' '}
          <a
            className="text-link underline"
            href={pending?.verificationUri ?? 'https://github.com/login/device'}
            target="_blank"
            rel="noreferrer"
          >
            {pending?.verificationUri ?? 'https://github.com/login/device'}
          </a>
        </p>
        <div className="mt-3">
          <Button variant="ghost" onClick={() => void cancel()} loading={busy}>
            取消
          </Button>
        </div>
      </Card>
    )
  }

  if (view === 'loggedIn') {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-sm text-fg">
              {user?.login ? `已登录 @${user.login}` : '已登录 GitHub'}
            </span>
          </div>
          <Button variant="ghost" onClick={() => setConfirmLogout(true)} disabled={busy}>
            退出登录
          </Button>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">
          退出会清除本机保存的 GitHub 凭据；仓库列表和 clone / fork / 分类这些本地标记不受影响。
        </p>
        <ConfirmDialog
          open={confirmLogout}
          title="退出登录？"
          description="会清除本机保存的 GitHub 凭据，之后再同步需要重新登录或重新填写 PAT。"
          confirmText="退出登录"
          danger
          onConfirm={() => void logout()}
          onCancel={() => setConfirmLogout(false)}
        />
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-sm font-medium text-fg">用 GitHub 登录</h2>
      <p className="mt-1 text-xs text-fg-subtle">
        点一下按钮，浏览器会自动打开 GitHub 的授权页；把页面里显示的 8 位验证码粘进去、点
        Authorize 就行，不需要再回本应用点确认。
      </p>
      {/* 只在「本机有凭据、但这一次读不出」时出现。不挡按钮：重新登录正是那条出路。 */}
      {tokenError ? (
        <p className="mt-2 text-xs text-warning">
          本机存着一条 GitHub 凭据，但这一次读不出它。重新登录会写一条新的进去、覆盖掉它
          （下面「GitHub Token」那张卡片也可以直接重填）。原因：{tokenError}
        </p>
      ) : null}
      <div className="mt-3">
        <Button variant="primary" onClick={() => void start()} loading={busy}>
          用 GitHub 登录
        </Button>
      </div>
    </Card>
  )
}
