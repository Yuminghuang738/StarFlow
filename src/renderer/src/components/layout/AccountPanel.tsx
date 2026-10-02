import { useEffect, useRef, useState } from 'react'
import { useNav } from './NavContext'
import { useGithubAuth } from '../auth/useGithubAuth'
import { Button } from '../common/Button'
import { ConfirmDialog } from '../common/ConfirmDialog'

/**
 * 侧边栏左下角的账号块（原来是写死的「v0.1.0 / Hackathon Build」）。
 *
 * 三件事：显示头像 + 昵称、点一下就地登录或退出、以及**说不出账号时说实话**。
 *
 * 之所以要挂在这里而不是只留在设置页：登录/退出是"随时可能想做"的动作，
 * 而设置页要先切过去、再找到那张卡片。侧边栏是常驻的，就地展开是最短的路径。
 *
 * 状态机与四个动作复用 useGithubAuth（与设置页的 GithubLoginCard 同一套，
 * 那一侧登录了这边会自动跟着变，反之亦然——两边各写一份设备流必然会走岔）。
 */
export function AccountPanel(): React.JSX.Element {
  const auth = useGithubAuth()
  const { goTo } = useNav()
  const [open, setOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  /** 头像加载失败（GitHub 挂了 / 离线 / 图片被拦）时退回首字母，不留一个破图 */
  const [avatarFailed, setAvatarFailed] = useState(false)

  const rootRef = useRef<HTMLDivElement | null>(null)

  const user = auth.user
  const avatarUrl = user?.avatar_url ?? null
  const login = user?.login ?? null
  const displayName = user?.name?.trim() || login

  // 换了账号（或退了再登）要重新试一次头像，否则上一个人的失败状态会黏住
  useEffect(() => {
    setAvatarFailed(false)
  }, [avatarUrl])

  // 点外面 / 按 Esc 收起。只在展开时挂监听
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const remaining =
    auth.deadline === null ? 0 : Math.max(0, Math.ceil((auth.deadline - auth.now) / 1000))

  /** 按钮上那两行字。登录态没说清的时候（未知 / 读不出）不许说成"未登录" */
  function triggerText(): { primary: string; secondary: string } {
    switch (auth.view) {
      case 'loading':
        return { primary: '登录状态未知', secondary: '正在检查…' }
      case 'unavailable':
        return { primary: '未登录 GitHub', secondary: '此环境不支持登录' }
      case 'waiting':
        return { primary: '等待授权…', secondary: `剩余 ${remaining} 秒` }
      case 'loggedIn':
        return displayName === null
          ? { primary: '已登录 GitHub', secondary: '账号信息未取到' }
          : { primary: displayName, secondary: login === displayName ? '已登录' : `@${login}` }
      default:
        return auth.tokenError === null
          ? { primary: '未登录 GitHub', secondary: '点击登录' }
          : { primary: '未登录 GitHub', secondary: '凭据这一次读不出' }
    }
  }
  const { primary, secondary } = triggerText()

  /** 取不到账号时的说明。**不能装作"没登录"**——那会让用户去重登一个根本没坏的东西 */
  const viewerProblem =
    auth.viewerError !== null
      ? `读不到账号信息（${auth.viewerError}）`
      : auth.viewer?.user === null && auth.viewer.reason === 'error'
        ? (auth.viewer.detail ?? '有 Token 但这一次没能确认身份')
        : auth.viewer?.user === null && auth.viewer.reason === 'unavailable'
          ? (auth.viewer.detail ?? '此环境读不到账号')
          : null

  /**
   * 头像是**函数调用**而不是 `<Avatar/>` 组件：在渲染里声明组件会让它每次渲染都是
   * 一个新的组件类型，React 会把旧的卸载重挂——等待授权那会儿倒计时每秒一跳，
   * 头像就会跟着重下重画（还会把 onError 的失败状态冲掉）。普通函数返回的元素
   * 类型稳定，不会重挂。
   */
  function renderAvatar(): React.JSX.Element {
    if (login !== null && avatarUrl !== null && !avatarFailed) {
      return (
        <img
          src={avatarUrl}
          alt=""
          // GitHub 的头像接口会因为带 Referer 而 403；no-referrer 是官方推荐的用法
          referrerPolicy="no-referrer"
          onError={() => setAvatarFailed(true)}
          className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
        />
      )
    }
    const initial = login === null ? null : login.slice(0, 1).toUpperCase()
    return (
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-medium text-fg-muted"
        aria-hidden
      >
        {initial ?? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="8.5" r="3.5" />
            <path strokeLinecap="round" d="M4.8 20c.9-3.4 3.8-5.2 7.2-5.2s6.3 1.8 7.2 5.2" />
          </svg>
        )}
      </span>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`GitHub 账号：${primary}${secondary === '' ? '' : `，${secondary}`}`}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2/60 px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {renderAvatar()}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-fg">{primary}</span>
          <span className="block truncate text-[11px] text-fg-subtle">{secondary}</span>
        </span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-fg-subtle"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m7 14.5 5-5 5 5" />
        </svg>
      </button>

      {/* 往上弹：它在侧边栏最底下，往下弹会出界。宽一点没关系，它是浮层，
          w-64 比侧边栏宽，跨到内容区上更清楚 */}
      {open ? (
        <div
          role="dialog"
          aria-label="GitHub 账号"
          className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-lg border border-border-strong bg-surface p-3 shadow-xl"
        >
          {auth.view === 'loading' ? (
            <p className="text-xs text-fg-subtle">正在检查登录状态…</p>
          ) : auth.view === 'unavailable' ? (
            <>
              <p className="text-xs text-fg-muted">{auth.reason ?? 'GitHub 登录当前不可用'}</p>
              {/* 刻意**不给**登录按钮：能力本身不可用，按钮点下去只会报错，
                  那是这个界面上最气人的一种东西 */}
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => {
                  setOpen(false)
                  goTo('settings')
                }}
              >
                去设置
              </Button>
            </>
          ) : auth.view === 'waiting' ? (
            <>
              <p className="text-xs text-fg-muted">等待授权 · 剩余 {remaining} 秒</p>
              <code className="mt-2 block select-all rounded-md border border-border-strong bg-surface-2 px-2 py-1.5 text-center font-mono text-lg tracking-widest text-primary">
                {auth.pending?.userCode ?? ''}
              </code>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => void auth.copyCode()}>
                  复制
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  loading={auth.busy}
                  onClick={() => void auth.cancel()}
                >
                  取消
                </Button>
              </div>
              <a
                className="mt-2 block truncate text-[11px] text-link underline"
                href={auth.pending?.verificationUri ?? 'https://github.com/login/device'}
                target="_blank"
                rel="noreferrer"
              >
                没打开浏览器？点这里
              </a>
            </>
          ) : auth.view === 'loggedIn' ? (
            <>
              <p className="truncate text-xs text-fg">
                {displayName === null ? '已登录 GitHub' : displayName}
                {login !== null && login !== displayName ? (
                  <span className="text-fg-subtle"> @{login}</span>
                ) : null}
              </p>
              {viewerProblem === null ? null : (
                <p className="mt-1 text-[11px] text-warning">{viewerProblem}</p>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 w-full"
                disabled={auth.busy}
                onClick={() => setConfirmLogout(true)}
              >
                退出登录
              </Button>
              <p className="mt-2 text-[11px] text-fg-subtle">
                退出只清除本机保存的 GitHub 凭据；仓库列表与 clone / fork / 分类标记不受影响。
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-fg-muted">未登录 GitHub</p>
              {/* 本机有凭据但这一次读不出（换机器 / 密钥环变了）：不挡按钮，重登正是出路 */}
              {auth.tokenError === null ? null : (
                <p className="mt-1 text-[11px] text-warning">
                  本机存着一条凭据，但这一次读不出它。重新登录会写一条新的覆盖掉它。原因：
                  {auth.tokenError}
                </p>
              )}
              <Button
                size="sm"
                variant="primary"
                className="mt-2 w-full"
                loading={auth.busy}
                onClick={() => void auth.start()}
              >
                用 GitHub 登录
              </Button>
              <p className="mt-2 text-[11px] text-fg-subtle">
                会在浏览器里打开授权页，把页面上的 8 位验证码粘进去就行。
              </p>
            </>
          )}
        </div>
      ) : null}

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
    </div>
  )
}
