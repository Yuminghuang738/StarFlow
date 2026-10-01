import type { ReactNode } from 'react'

export interface CardProps {
  className?: string
  children: ReactNode
}

export function Card({ className = '', children }: CardProps): React.JSX.Element {
  return (
    <div
      className={`rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}
