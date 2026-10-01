import type { IpcResult } from '@shared/types'
import { pushToast } from '../components/common/Toast'

/**
 * 拆 IpcResult：成功返回 data，失败先 toast 再 throw，调用方可以 try/catch。
 * 注意 toast 已经弹过了，调用方不要再弹一次。
 */
export async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const res = await p
  if (res.ok) return res.data
  pushToast({ type: 'error', message: res.error })
  throw new Error(res.error)
}

/**
 * 拆 IpcResult 的「不中断」版本：失败时 toast 后返回 null，不抛错。
 * 给「失败也不该中断流程」的场景用（推荐、摘要等）。
 */
export async function call<T>(p: Promise<IpcResult<T>>): Promise<T | null> {
  const res = await p
  if (res.ok) return res.data
  pushToast({ type: 'error', message: res.error })
  return null
}

/**
 * 统一提取错误文案：Error → .message，其它 → String(err)，兜底 '未知错误'。
 */
export function ipcErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return String(err)
  } catch {
    return '未知错误'
  }
}

/**
 * 相对时间展示：刚刚 / N 分钟前 / N 小时前 / N 天前 / 超过 30 天显示 'YYYY-MM-DD'。
 * 相对时间本身和时区无关；超过 30 天那条直接用 iso.slice(0, 10)
 * （iso 是 UTC 的 ISO 8601，前 10 位本来就是 UTC 日期），不要为此再造本地时间格式化函数。
 */
export function formatRelative(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso.slice(0, 10)
  const diffMs = Date.now() - then
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `${days} 天前`
  return iso.slice(0, 10)
}

/**
 * 数字缩写：≥1000000 → '1.2M'，≥1000 → '1.2k'，其余原样返回。
 */
export function formatStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}
