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
  const removeLocal = useRepoStore((s) => s.removeLocal)
  const cancelClone = useRepoStore((s) => s.cancelClone)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
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

  function onConfirmRemoveLocal(): void {
    setRemoveConfirmOpen(false)
    void run('removeLocal', () => removeLocal(repo.full_name))
  }

  function onCancelClone(): void {
    // ⚠️ 必须绕开 run()：clone 进行中 busyRef.current 恒为 true，run() 会在第一行
    // 直接 return，取消按钮将永远点不动。取消本身幂等（主进程对没在跑的直接回
    // false），提示由 store 内部处理，所以这里裸调即可。
    void cancelClone(repo.full_name)
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

        {/* Clone 与「打开目录」互斥：已 clone 就只给「打开目录」，不再渲染 Clone。
            没有"副本缺失"的中间态——目录一旦在磁盘上消失，主进程的对账会在下次
            load() 时把 cloned_path 清掉，卡片自然回到 [Clone]。 */}
        {clonedPath ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void run('openDir', () => openDir(clonedPath))}
              title={clonedPath}
            >
              {pendingAction === 'openDir' ? '打开中…' : '打开目录'}
            </Button>
            {/* ghost 不是 danger：Unstar 已经占了红色，而这个删掉还能重新 clone 回来 */}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setRemoveConfirmOpen(true)}
              title={`删除本地副本：${clonedPath}`}
            >
              {pendingAction === 'removeLocal' ? '删除中…' : '删除本地副本'}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void run('clone', () => clone(repo.full_name))}
            >
              {pendingAction === 'clone' ? 'Clone 中…' : 'Clone'}
            </Button>
            {/* 只在克隆进行中出现的取消按钮，紧挨 Clone。刻意不加 disabled={busy}：
                clone 期间 busy 恒为 true，加了就等于把按钮永久禁用；也不走 run()。 */}
            {pendingAction === 'clone' ? (
              <Button size="sm" variant="ghost" onClick={onCancelClone}>
                取消克隆
              </Button>
            ) : null}
          </>
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

      {/* 只在有路径时挂载，顺带让 TS 把 clonedPath 窄化成 string */}
      {clonedPath ? (
        <ConfirmDialog
          open={removeConfirmOpen}
          danger
          title="确认删除本地副本？"
          description={`将从磁盘上删除目录：${clonedPath}（以本地记录为准）。此操作不可撤销，可以重新 Clone 回来，但目录里未提交的改动会一起丢失。`}
          confirmText="删除本地副本"
          onConfirm={onConfirmRemoveLocal}
          onCancel={() => setRemoveConfirmOpen(false)}
        />
      ) : null}
    </>
  )
}
