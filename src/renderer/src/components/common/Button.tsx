import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** 加载中：显示转圈并自动 disabled */
  loading?: boolean
  children: ReactNode
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-sky-600 text-white hover:bg-sky-500',
  secondary: 'bg-slate-700 text-slate-100 hover:bg-slate-600',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800'
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm'
}

/**
 * 通用按钮。secondary 是默认 variant；primary 用主色 sky-600（不是 indigo）。
 * 加了 forwardRef（ConfirmDialog 要拿确认按钮做自动 focus），并新增 loading 态。
 * 其余样式与骨架保持一致。
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, className = '', type = 'button', children, ...rest },
  ref
) {
  const classes = [
    'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button ref={ref} type={type} disabled={loading || rest.disabled} className={classes} {...rest}>
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : null}
      {children}
    </button>
  )
})
