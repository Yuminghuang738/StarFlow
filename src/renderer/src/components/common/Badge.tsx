import { cn } from '../../lib/cn'

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'muted'

const TONE_CLASS: Record<Tone, string> = {
  default: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  // 与 warning 区分开：warning 是"需要注意但没坏"，danger 是"状态本身就不对"
  // （如本地仓库已分叉 / 目录对不上），不该和"落后几个提交"共用一种颜色。
  danger: 'bg-danger/15 text-danger',
  muted: 'bg-surface-2 text-fg-muted'
}

export function Badge({
  children,
  tone = 'default'
}: {
  children: React.ReactNode
  tone?: Tone
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_CLASS[tone]
      )}
    >
      {children}
    </span>
  )
}
