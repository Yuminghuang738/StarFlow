import { useEffect, useState } from 'react'
import type { CloneProgress } from '@shared/types'

/** git 大约每秒吐一行进度；300ms 足够跟手，又不至于把 IPC 打满 */
const POLL_MS = 300

/** git 的阶段名映射成人话。认不出来的阶段名原样降级成「克隆中」，不显示 raw 英文 */
const STAGE_LABELS: Record<string, string> = {
  receiving: '接收对象',
  resolving: '解析增量',
  counting: '统计对象',
  compressing: '压缩对象'
}

/**
 * Clone 进度条。挂在 RepoActions 的按钮下方，只在 clone 进行中挂载
 * （由 pendingAction 控制），卸载即停止轮询。
 *
 * 三种状态全靠 progress 本身区分，不需要额外的标志位：
 *   null            —— 还没开始克隆（此刻用户正对着目录选择框），整个组件渲染成空
 *   stage === null  —— git 跑起来了但还没吐第一行进度，显示不确定态 + 已用秒数
 *   否则            —— 画确定态进度条
 *
 * ⚠️ 两条不要改的地方：
 *   1. 不用 lib/api 的 unwrap()：它失败时会弹 toast，而这里是每 300ms 一次的轮询，
 *      一次抖动就能刷出一屏 toast。轮询失败直接忽略，下一轮会自愈。
 *   2. 状态留在组件本地、不进 repoStore：进度是纯 UI 临时数据，进 store 要动
 *      冻结的 renderer-contracts.md，而且它跟仓库列表的生命周期完全不同。
 */
export function CloneProgressBar({ fullName }: { fullName: string }): React.JSX.Element | null {
  const [progress, setProgress] = useState<CloneProgress | null>(null)

  useEffect(() => {
    let cancelled = false
    // 单次 IPC 偶尔会比轮询间隔还慢，不挡住的话请求会叠起来，读数来回跳
    let inFlight = false

    async function tick(): Promise<void> {
      if (inFlight) return
      inFlight = true
      try {
        const res = await window.api.local.getCloneProgress(fullName)
        if (!cancelled && res.ok) setProgress(res.data)
      } catch {
        // 忽略：进度条是锦上添花，不该因为一次轮询失败影响 clone 本身的结果
      } finally {
        inFlight = false
      }
    }

    // 先立刻取一次。小仓库几百毫秒就克隆完了，等满一个间隔再取就什么都看不到。
    void tick()
    const timer = setInterval(() => void tick(), POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [fullName])

  if (progress === null) return null

  const { stage, percent, processed, total, elapsedMs } = progress
  const elapsed = Math.round(elapsedMs / 1000)

  return (
    <div className="mt-2 w-full max-w-md">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-fg-muted">
          {stage === null ? '正在连接 GitHub…' : (STAGE_LABELS[stage] ?? '克隆中')}
        </span>
        <span className="shrink-0 tabular-nums text-fg-subtle">
          {stage === null ? '' : `${percent}% · `}已用 {elapsed}s
        </span>
      </div>

      {/* duration 让两次进度事件之间平滑过渡，而不是一格一格地跳——数据仍然只有
          git 真正报出来的那个值，没有插值造假 */}
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        {stage === null ? (
          <div className="h-full w-full animate-pulse rounded-full bg-primary/40" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      {/* git 的进度行给的是对象计数，不是字节数，所以这里写「个对象」而不是 MB */}
      {total > 0 ? (
        <p className="mt-1 text-xs tabular-nums text-fg-subtle">
          {processed} / {total} 个对象
        </p>
      ) : null}
    </div>
  )
}
