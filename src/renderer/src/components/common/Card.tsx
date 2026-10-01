import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface CardProps {
  className?: string
  children: ReactNode
}

export function Card({ className = '', children }: CardProps): React.JSX.Element {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4 shadow-sm', className)}>
      {children}
    </div>
  )
}
