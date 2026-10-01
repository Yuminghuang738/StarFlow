import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并 className。
 *
 * 不只是"拼字符串好看"：`twMerge` 负责解决**同类工具类的冲突**。组件里现在是
 * `` `rounded-lg p-4 ${className}` `` 这种写法，调用方传 `className="p-6"` 时会
 * 同时产出 `p-4` 和 `p-6`，谁赢取决于 CSS 源码顺序而不是书写顺序——这是现存的
 * 潜在 bug。走 cn 之后调用方稳定获胜。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
