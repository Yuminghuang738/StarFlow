import { cn } from '../../lib/cn'

type Tone = 'default' | 'success' | 'warning' | 'muted'

const TONE_CLASS: Record<Tone, string> = {
  default: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
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
