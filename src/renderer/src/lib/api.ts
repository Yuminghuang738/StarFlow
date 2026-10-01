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
 * 展示格式化（formatStars / formatRelative）的实现搬到了 lib/format.ts——
 * 这两条曾经在 lib/api.ts 和 components/repo/repoFormat.ts 各有一份、规则还不一样，
 * 同一个仓库会在两个页面上显示成两个数。这里 re-export 是为了保住原有的导出面，
 * 调用点（如 pages/Report.tsx 的 `from '../lib/api'`）一行都不用改。
 */
export { formatRelative, formatStars } from './format'

