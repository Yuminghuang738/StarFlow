import { useRef, useState } from 'react'
import type { Repo } from '@shared/types'
import { useRepoStore } from '../../store/repoStore'
import { Button } from '../common/Button'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { CloneProgressBar } from './CloneProgressBar'
import { formatRelative } from './repoFormat'

/**
 * 卡片底部的四个操作按钮（Unstar / Fork / Clone / 打开目录）。
 *
 * ⚠️ Toast 归属：成功与失败的提示全部由 P6 的 repoStore 内部弹出，这里一个都不弹。
 * 本组件只负责两件事：
 *   ① 控制 Unstar 二次确认弹窗的开关；
 *   ② 维护 pendingAction，让所有按钮在操作进行中统一禁用（避免并发点两次）。
 * catch 里只 console.error，绝不追加 toast，否则会和 store 的提示重复弹两次。
 */
export function RepoActions({ repo }: { repo: Repo }): React.JSX.Element {
  const unstar = useRepoStore((s) => s.unstar)
  const fork = useRepoStore((s) => s.fork)
  const clone = useRepoStore((s) => s.clone)
  const openDir = useRepoStore((s) => s.openDir)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  // 同步的防重入锁。只靠 pendingAction 不够：React 的 setState 是异步的，
  // 同一个 tick 里连续点两次（用户连点、或确认按钮被双击），两次调用都会读到
  // pendingAction === null 从而并发发起两个请求（unstar 会弹两次 toast，
  // clone 会弹两次目录选择框）。用 ref 才能在同一 tick 内立刻拦住第二次。
  const busyRef = useRef(false)

  // 只要有任意操作在跑，所有按钮都禁用，防止并发
  const busy = pendingAction !== null

  const forkedFullName = repo.local?.forked_full_name
  const forkedAt = repo.local?.forked_at
  const clonedPath = repo.local?.cloned_path

  async function run(action: string, task: () => Promise<void>): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    setPendingAction(action)
    try {
      await task()
    } catch (e) {
      // store 已经弹过 toast / 已经处理过"用户取消选目录"的静默路径，这里只留排查日志
      console.error('[RepoActions] 操作失败', repo.full_name, action, e)
    } finally {
      busyRef.current = false
      setPendingAction(null)
    }
  }

  function onConfirmUnstar(): void {
    // 先关弹窗再执行，避免等待期间弹窗还挂在界面上
    setConfirmOpen(false)
    void run('unstar', () => unstar(repo.full_name))
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmOpen(true)}>
          {pendingAction === 'unstar' ? '取消中…' : 'Unstar'}
        </Button>

        {forkedFullName ? (
          // 已 Fork：按钮置为完成态并禁用，旁边给出可点击的 fork 仓库地址
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button size="sm" disabled>
              已 Fork
            </Button>
            <a
              href={`https://github.com/${forkedFullName}`}
              target="_blank"
              rel="noreferrer"
              className="max-w-[16rem] truncate text-xs text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
              title={forkedFullName}
            >
              {forkedFullName}
            </a>
            {forkedAt ? (
              <span className="text-xs text-slate-500">{formatRelative(forkedAt)}</span>
            ) : null}
          </div>
        ) : (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run('fork', () => fork(repo.full_name))}
          >
            {pendingAction === 'fork' ? 'Fork 中…' : 'Fork'}
          </Button>
        )}

        {/* Clone 与「打开目录」互斥：已 clone 就只给「打开目录」，不再渲染 Clone */}
        {clonedPath ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void run('openDir', () => openDir(clonedPath))}
            title={clonedPath}
          >
            {pendingAction === 'openDir' ? '打开中…' : '打开目录'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => void run('clone', () => clone(repo.full_name))}
          >
            {pendingAction === 'clone' ? 'Clone 中…' : 'Clone'}
          </Button>
        )}
      </div>

      {/* 只在克隆进行中挂载：卸载即停止轮询。clone 结束后主进程的记录还在，
          常挂会一直显示上一次的 100% */}
      {pendingAction === 'clone' ? <CloneProgressBar fullName={repo.full_name} /> : null}

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="确认取消 Star？"
        description={`将从你的 GitHub 账号取消 Star「${repo.full_name}」，此操作不可撤销。`}
        confirmText="取消 Star"
        onConfirm={onConfirmUnstar}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
