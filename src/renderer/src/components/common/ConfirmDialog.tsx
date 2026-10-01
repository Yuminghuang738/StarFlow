import { useEffect } from 'react'
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

  if (!open) return <></>

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      // 点遮罩关闭；点对话框内部不该关闭，所以内层要 stopPropagation
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg border border-border-strong bg-surface p-5 shadow-xl"
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
      </div>
    </div>
  )
}
