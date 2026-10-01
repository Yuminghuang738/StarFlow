type Tone = 'default' | 'success' | 'warning' | 'muted'

const TONE_CLASS: Record<Tone, string> = {
  default: 'bg-sky-900/60 text-sky-300',
  success: 'bg-emerald-900/60 text-emerald-300',
  warning: 'bg-amber-900/60 text-amber-300',
  muted: 'bg-slate-800 text-slate-400'
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}
