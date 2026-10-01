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
