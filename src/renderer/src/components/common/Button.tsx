import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** 加载中：显示转圈并自动 disabled */
  loading?: boolean
  children: ReactNode
}

// primary / danger 用 `-solid` 那组 token：它们是「有色底 + 白字」，
// 不能拿 --c-primary / --c-danger 当背景——那两个是当文字用的，暗色下偏亮，压不住白字。
// 详见 index.css 里实心语义背景那段的说明。
const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-primary-solid text-solid-fg hover:bg-primary-solid/90',
  secondary: 'bg-surface-2 text-fg hover:bg-border-strong',
  danger: 'bg-danger-solid text-solid-fg hover:bg-danger-solid/90',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-2'
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm'
}

/**
 * 通用按钮。secondary 是默认 variant；primary 用主色 token（--c-primary，两套主题各一组）。
 * 带 forwardRef，调用方（或以后的 ConfirmDialog）需要时能拿到 DOM 节点。
 * 其余样式与骨架保持一致。
 *
 * ⚠️ `disabled` 必须**解构出来**再拼：写成 `disabled={loading || rest.disabled}` 且
 * `{...rest}` 在后的话，rest 里的 disabled 会把算好的值覆盖掉——调用方只要显式传了
 * `disabled={false}`（很常见，比如 `disabled={draft.trim() === ''}`），loading 就不再
 * 自动禁用了，组件文档承诺的"加载中自动禁用"是假的，而按钮看起来在转圈、点了却真的
 * 会再发一次请求。
 *
 * 用 `transition` 而不是 `transition-colors`：按下时的缩放也要跟着过渡，
 * 只写 transition-colors 的话 scale 是瞬间跳变，反而比不做还生硬。
 * `enabled:active:` 两道前缀缺一不可——disabled 的按钮按下去不该有反馈。
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    className = '',
    type = 'button',
    disabled = false,
    children,
    ...rest
  },
  ref
) {
  const classes = cn(
    'inline-flex items-center justify-center rounded-md font-medium transition',
    'enabled:active:scale-[0.97]',
    // 键盘可达性：只对键盘焦点画环（focus-visible），鼠标点击不画，否则每点一下都闪一圈
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-50',
    SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    className
  )

  return (
    <button ref={ref} type={type} disabled={loading || disabled} className={classes} {...rest}>
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
