import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { FIELD_BASE, FIELD_SIZE, type FieldSize } from './field'

// 和 Input 一样要 Omit 掉原生 size（`<select size>` 表示可见行数，是 number）。
// 这里只把它当尺寸档位用：调用方要的就是 sm / md 两档。
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: FieldSize
}

/**
 * 通用下拉。
 *
 * 刻意**保留原生外观**（不加 `appearance-none`）：自绘箭头需要自己补一个指示图标，
 * 而原生箭头在 `color-scheme` 正确的前提下两套主题都能跟着变——index.css 里
 * `:root`/`.dark` 各给了 color-scheme，暗色下弹出的 option 列表才是深底。
 * 换自定义 listbox 是另一件事，本次不做。
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'sm', className, ...rest },
  ref
) {
  return <select ref={ref} className={cn(FIELD_BASE, FIELD_SIZE[size], className)} {...rest} />
})
