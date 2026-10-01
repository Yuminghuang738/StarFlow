import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { FIELD_BASE, FIELD_SIZE, type FieldSize } from './field'

// 必须 Omit 掉原生 size：HTML 的 size 是 number（可见字符数），
// 直接extends 再重声明成 'sm' | 'md' 会报 "Interface incorrectly extends"。
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: FieldSize
}

/** 通用输入框。宽度由调用方用 className 给（flex-1 / w-full / w-64…），这里只管外观。 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'sm', className, type = 'text', ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(FIELD_BASE, FIELD_SIZE[size], className)}
      {...rest}
    />
  )
})
