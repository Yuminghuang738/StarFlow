import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  danger?: boolean
  onConfirm(): void
  onCancel(): void
}

/** 面板内可聚焦的元素，按 DOM 顺序（即 Tab 顺序） */
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * 确认对话框。**对外 props 不变**，只是把「有/没有」换成了常驻 AnimatePresence，
 * 这样关闭时才有地方播 exit（原来 `if (!open) return <></>` 是立刻卸载，动画无从谈起）。
 *
 * 遮罩用 motion.div 同时承担居中布局：只让遮罩淡入，面板只做 scale。
 * 面板不再单独 fade——父级的 opacity 会一起带上，两层叠加会显得发灰。
 *
 * ⚠️ 焦点管理不是锦上添花，是这个组件能不能用的前提：调用方是列表里那些
 * 「Unstar / 删除本地副本」按钮，键盘用户按 Enter 打开之后，如果焦点还留在被遮罩
 * 盖住的那一行上，继续 Tab 会在**背景列表**里穿行——够不到对话框里的两个按钮，
 * 屏幕上却清楚地画着一个"要不要取消"的问题，等的是一个按不到的回答。
 * 所以三件事都要做：打开时把焦点移进来、Tab 在这两个按钮之间循环、关闭后还给触发它的人。
 */
export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element {
  const { open, title, description, confirmText = '确认', danger = false, onConfirm, onCancel } = props
  const panelRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  /** 打开之前焦点在谁那儿。关闭后要原样还回去 */
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // —— Esc 关闭 —— 依赖 onCancel，调用方现在传的都是内联箭头（每次渲染都是新函数），
  // 所以这个 effect 会被重建，单纯挂/摘一个监听器，代价可以忽略。
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  /**
   * —— 焦点管理 —— 只依赖 `open`，**绝不能依赖 onCancel 或任何每次渲染都变的东西**。
   *
   * 这个 effect 有清理逻辑（还焦点），依赖里多一个不稳定的函数就会让它每次重渲染
   * 都跑一遍"还焦点 → 再夺回来"：用户 Tab 到「取消」上之后，后台随便一次 store 更新
   * 都会把焦点弹回确认键。所以这里刻意不引用 onCancel——Esc 的处理在另一个 effect 里。
   */
  useEffect(() => {
    if (!open) return

    // 记下"是谁打开的"，关闭时还给它。存的是元素本身而不是 id/选择器：
    // 列表会因筛选、排序、删除而重排，选择器会指到别的行上去。
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // 焦点移进面板：默认落在确认按钮上，Enter 一下就能确认，这是键盘用户最想走的路径。
    // 用 requestAnimationFrame 等一帧再 focus，是因为此刻面板刚被交给 framer-motion，
    // 还在挂载路径上；等这一帧过去，节点一定已经在文档里了，focus 不会被丢掉。
    const raf = requestAnimationFrame(() => confirmRef.current?.focus())

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return

      // 焦点陷阱：算出面板里当前可聚焦的元素，在首尾之间循环。
      // 每次都现算而不是缓存一份——按钮可能因为 loading 变成 disabled，
      // 缓存下来的话 Tab 会落到一个已经不可聚焦的元素上，焦点就凭空消失了。
      const panel = panelRef.current
      if (panel === null) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement

      // 焦点跑到面板外面（背景列表、地址栏）时，Shift+Tab 与 Tab 都拉回面板内
      if (active !== null && !panel.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      // 还焦点。isConnected 检查是必要的：触发它的那一行可能已经不在了
      // （比如确认删除了本地副本，那一行整块换了内容），这时候对着一个脱离
      // 文档的元素 focus() 什么也不会发生，焦点会掉到 body 上——键盘用户
      // 就只能从头 Tab 一遍。退而求其次，回到 body 之外最近的落点。
      const target = returnFocusRef.current
      if (target !== null && target.isConnected) target.focus()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="confirm"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          // 点遮罩关闭；点对话框内部不该关闭，所以内层要 stopPropagation
          onClick={onCancel}
          role="presentation"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-sm rounded-lg border border-border-strong bg-surface p-5 shadow-xl"
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-fg">{title}</h2>
            {description ? <p className="mt-2 text-sm text-fg-muted">{description}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                取消
              </Button>
              <Button
                ref={confirmRef}
                variant={danger ? 'danger' : 'primary'}
                onClick={onConfirm}
              >
                {confirmText}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
