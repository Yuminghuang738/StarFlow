import { useEffect, useState } from 'react'

/**
 * 自绘标题栏（Phase 0 的最简版，样式留给界面重做那个 PR 换皮）。
 *
 * 为什么 Phase 0 就必须有它：主进程那边 `frame: false` 一落地，原生标题栏连同
 * 关闭按钮一起没了。如果这个组件留到界面 PR 才做，中间这一整条 PR 栈上的窗口
 * 都关不掉，只能去杀进程。
 *
 * 三条交互上的坑，都在这里处理掉了：
 *   1. 拖拽区会吞掉鼠标事件 → 区里的每一个按钮都必须显式 no-drag，否则点不动。
 *   2. `-webkit-app-region` 是 CSS 属性 → 只能用类名，不能写内联样式
 *      （React 的 CSSProperties 里没有 WebkitAppRegion）。
 *   3. 本项目没有 main→renderer 推送 → 最大化图标只能靠"点击时用返回值权威更新"
 *      + "window.resize 兜底查询"两招同步。
 */

/**
 * 窗口操作一律裸调、失败只记日志。
 *
 * 刻意不走 unwrap()：那个helper在 { ok: false } 时会弹一条红 toast，而"窗口管理器
 * 抢先把窗口关了""连点两次关闭"这类情况完全不是用户需要知道的错误。
 */
async function fire(op: () => Promise<unknown>): Promise<void> {
  try {
    await op()
  } catch (err) {
    console.error('[titlebar] 窗口操作失败：', err)
  }
}

function MinimizeIcon(): React.JSX.Element {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
    </svg>
  )
}

function MaximizeIcon(): React.JSX.Element {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}

function RestoreIcon(): React.JSX.Element {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
      <rect
        x="1.5"
        y="3.5"
        width="7"
        height="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M3.5 3.5V1.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2 2l8 8M10 2l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

const BUTTON_BASE =
  'app-region-no-drag flex h-8 w-10 items-center justify-center text-slate-400 transition-colors'

export function TitleBar(): React.JSX.Element {
  // 初值 false：启动时窗口一定不是最大化，省掉一次首屏 IPC 往返
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let cancelled = false

    const sync = async (): Promise<void> => {
      const res = await window.api.window.isMaximized()
      // 卸载之后不要再 setState（窗口操作是异步的，卸载和返回可能撞上）
      if (!cancelled && res.ok) setMaximized(res.data)
    }

    void fire(sync)

    // resize 兜底：窗口被 WM 的快捷键、拖拽吸附、或双击标题栏改变时，
    // "点击最大化按钮"这条路径根本察觉不到。最大化/还原/全屏都会触发 resize，
    // 所以 debounce 一小下再查一次，避免拖窗口时逐帧 IPC。
    let timer: number | undefined
    const onResize = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void fire(sync), 120)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const onToggleMaximize = async (): Promise<void> => {
    const res = await window.api.window.toggleMaximize()
    // 用返回值权威更新，而不是自己取反：主进程可能因为窗口已销毁而没切成功
    if (res.ok) setMaximized(res.data)
  }

  return (
    <header className="app-region-drag flex h-9 shrink-0 select-none items-center justify-between border-b border-slate-800 bg-slate-900 pl-3">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-slate-400">
        <svg
          className="h-3.5 w-3.5 text-sky-500"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
        <span>StarPilot</span>
      </div>

      {/* 三个按钮各自 no-drag —— 否则点不动（拖拽区会吞掉鼠标事件） */}
      <div className="flex items-center">
        <button
          type="button"
          aria-label="最小化"
          title="最小化"
          className={`${BUTTON_BASE} hover:bg-slate-800 hover:text-slate-100`}
          onClick={() => void fire(() => window.api.window.minimize())}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          aria-label={maximized ? '还原' : '最大化'}
          title={maximized ? '还原' : '最大化'}
          className={`${BUTTON_BASE} hover:bg-slate-800 hover:text-slate-100`}
          onClick={() => void fire(onToggleMaximize)}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          aria-label="关闭"
          title="关闭"
          className={`${BUTTON_BASE} hover:bg-red-600 hover:text-white`}
          onClick={() => void fire(() => window.api.window.close())}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}
