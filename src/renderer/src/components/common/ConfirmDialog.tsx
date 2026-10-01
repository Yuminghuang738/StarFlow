import { useEffect } from 'react'
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

/**
 * 确认对话框。**对外 props 不变**，只是把「有/没有」换成了常驻 AnimatePresence，
 * 这样关闭时才有地方播 exit（原来 `if (!open) return <></>` 是立刻卸载，动画无从谈起）。
 *
 * 遮罩用 motion.div 同时承担居中布局：只让遮罩淡入，面板只做 scale。
 * 面板不再单独 fade——父级的 opacity 会一起带上，两层叠加会显得发灰。
 */
export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element {
  const { open, title, description, confirmText = '确认', danger = false, onConfirm, onCancel } = props

  // 按 Esc 关闭。依赖 onCancel，调用方传进来的通常是稳定的 useCallback
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

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
              <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmText}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
