import { useEffect, useRef, useState } from 'react'
import type { GithubAuthView } from './useGithubAuth'
import { useGithubAuth } from './useGithubAuth'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { ConfirmDialog } from '../common/ConfirmDialog'

export interface GithubLoginCardProps {
  /** 登录 / 退出成功后回调，让设置页重新读一次 hasToken（PAT 状态徽章要跟着变） */
  onAuthChange?: () => void
}

/**
 * GitHub OAuth Device Flow 登录块。用法见 prompts 与 README「用 GitHub 登录」。
 *
 * 状态机与四个动作全在 useGithubAuth 里（侧边栏的账号块共用同一套，见那个文件的说明）；
 * 这里只负责设置页的这张卡片长什么样。状态不往 repoStore 塞：RepoStore 是冻结契约，
 * 见 docs/renderer-contracts.md。
 *
 * 五个分支返回的根 Card **都不带 mt**：与上方区块的间距由所在页面的 PageContainer
 * 统一给（gap-5）。卡片自己带外边距，换个页面就会和容器的间距叠成两层。
 */
export function GithubLoginCard({ onAuthChange }: GithubLoginCardProps): React.JSX.Element {
  const auth = useGithubAuth()
  const [confirmLogout, setConfirmLogout] = useState(false)

  // onAuthChange 大多是父组件里的内联箭头函数，放进 hook 依赖会让等待被反复重建，
  // 所以走 ref。
  const onAuthChangeRef = useRef(onAuthChange)
  useEffect(() => {
    onAuthChangeRef.current = onAuthChange
  }, [onAuthChange])

  /**
   * 「登录态」这件事只上报**跨过边界**的那一次：进入 loggedIn、或从 loggedIn 出来。
   * 每次 view 变化都报的话，加载中 → 未登录 也会触发一次父组件的重新读取。
   */
  const prevView = useRef<GithubAuthView>('loading')
  useEffect(() => {
    const crossed = prevView.current !== auth.view
    if (crossed && (auth.view === 'loggedIn' || prevView.current === 'loggedIn')) {
      onAuthChangeRef.current?.()
    }
    prevView.current = auth.view
  }, [auth.view])

  if (auth.view === 'loading') {
    return (
      <Card>
        <h2 className="text-sm font-medium text-fg">用 GitHub 登录</h2>
        <p className="mt-1 text-xs text-fg-subtle">正在检查登录状态…</p>
      </Card>
    )
  }

  if (auth.view === 'unavailable') {
    return (
      <Card>
        <h2 className="text-sm font-medium text-fg">用 GitHub 登录</h2>
        <p className="mt-1 text-xs text-fg-subtle">{auth.reason ?? '当前不可用'}</p>
      </Card>
    )
  }

  if (auth.view === 'waiting') {
    const remaining =
      auth.deadline === null ? 0 : Math.max(0, Math.ceil((auth.deadline - auth.now) / 1000))
    return (
      <Card>
        <h2 className="text-sm font-medium text-fg">等待授权</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          已自动打开浏览器。在 GitHub 页面里输入下面这串验证码并点 Authorize，
          这个页面会自己变成已登录。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <code className="select-all rounded-md border border-border-strong bg-surface-2 px-4 py-2 font-mono text-2xl tracking-widest text-primary">
            {auth.pending?.userCode ?? ''}
          </code>
          <Button variant="ghost" size="sm" onClick={() => void auth.copyCode()}>
            复制
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          剩余 {remaining} 秒 · 没打开浏览器的话，手动访问{' '}
          <a
            className="text-link underline"
            href={auth.pending?.verificationUri ?? 'https://github.com/login/device'}
            target="_blank"
            rel="noreferrer"
          >
            {auth.pending?.verificationUri ?? 'https://github.com/login/device'}
          </a>
        </p>
        <div className="mt-3">
          <Button variant="ghost" onClick={() => void auth.cancel()} loading={auth.busy}>
            取消
          </Button>
        </div>
      </Card>
    )
  }

  if (auth.view === 'loggedIn') {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-sm text-fg">
              {auth.user?.login ? `已登录 @${auth.user.login}` : '已登录 GitHub'}
            </span>
          </div>
          <Button
            variant="ghost"
            onClick={() => setConfirmLogout(true)}
            disabled={auth.busy}
          >
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
          onConfirm={() => {
            setConfirmLogout(false)
            void auth.logout()
          }}
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
      {auth.tokenError ? (
        <p className="mt-2 text-xs text-warning">
          本机存着一条 GitHub 凭据，但这一次读不出它。重新登录会写一条新的进去、覆盖掉它
          （下面「GitHub Token」那张卡片也可以直接重填）。原因：{auth.tokenError}
        </p>
      ) : null}
      <div className="mt-3">
        <Button variant="primary" onClick={() => void auth.start()} loading={auth.busy}>
          用 GitHub 登录
        </Button>
      </div>
    </Card>
  )
}
