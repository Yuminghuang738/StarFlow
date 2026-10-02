// 本地 clone 相对上游的同步判定。
//
// 这个文件**刻意不 import 任何 git / Node / electron**：它是纯函数，
// 好让自检（scripts/selfcheck/local-sync.mjs）不装 git、不打桩就能把
// 每种状态和每条拒绝理由钉死。真正的 git 调用在 local.ts。
//
// 判定顺序本身就是正确性的一部分，见下面两处 ⚠️。

import type { LocalSyncState, LocalUpdateKind } from '@shared/types'

/**
 * 主进程探测出的原始事实。**每个 null 都表示"没拿到"，不是 0 / false**：
 * 这个区分是全文件的立身之本——把"没查出来"写成 0，界面就会把一次失败的
 * 检查显示成「已是最新」。
 */
export interface SyncProbe {
  /** cloned_path 在磁盘上还存在 */
  pathExists: boolean
  /** 目录名与仓库名一致（防止脏记录把更新落到不相干的目录上） */
  identityMatches: boolean
  /** 目录是一个 git 工作树（存在 .git） */
  isGitWorktree: boolean
  /** 当前分支名；'HEAD' 表示游离；null = 读不到 */
  branch: string | null
  /** 形如 'origin/main'；null = 没有跟踪分支 */
  upstream: string | null
  /** 领先 / 落后上游的提交数；null = 没拿到 */
  ahead: number | null
  behind: number | null
  /** 工作区脏不脏；null = 没拿到 */
  dirty: boolean | null
  /** fetch 失败的原因；非 null 时 ahead / behind 必然是 null */
  fetchError: string | null
  /** 其它非预期失败（读分支、读状态……）的原因 */
  fatalError: string | null
}

export interface SyncClassification {
  state: LocalSyncState
  detail: string | null
}

/**
 * 把探测事实归类成一个状态。
 *
 * ⚠️ **判定顺序不许重排**，尤其 `fetchError` 必须排在 ahead/behind 之前：
 * fetch 失败时 ahead/behind 是 null，若先撞上"差异读不到"就会把网络故障
 * 说成一个含糊的解析错误，丢掉"连不上远端"这条最有用的话。
 */
export function classifyLocalSync(probe: SyncProbe): SyncClassification {
  if (!probe.pathExists) {
    return { state: 'missing-on-disk', detail: '磁盘上已找不到这个目录' }
  }
  if (!probe.identityMatches) {
    return { state: 'path-mismatch', detail: '目录名与仓库名不符，无法确认这是该仓库的副本' }
  }
  if (!probe.isGitWorktree) {
    return { state: 'not-git', detail: '目录存在，但不是 git 工作树' }
  }
  if (probe.fatalError !== null) {
    return { state: 'error', detail: probe.fatalError }
  }
  if (probe.branch === null) {
    return { state: 'error', detail: '读不到当前分支' }
  }
  if (probe.branch === 'HEAD') {
    return { state: 'detached', detail: '当前处于游离 HEAD，没有分支可以快进' }
  }
  if (probe.upstream === null) {
    return { state: 'no-upstream', detail: `分支 ${probe.branch} 没有跟踪分支` }
  }
  if (probe.fetchError !== null) {
    return { state: 'error', detail: probe.fetchError }
  }
  if (probe.ahead === null || probe.behind === null) {
    return { state: 'error', detail: '读不到与上游的提交差异' }
  }
  if (probe.ahead > 0 && probe.behind > 0) {
    return { state: 'diverged', detail: `本地领先 ${probe.ahead}、落后 ${probe.behind}，已分叉` }
  }
  if (probe.behind > 0) {
    return { state: 'behind', detail: null }
  }
  if (probe.ahead > 0) {
    return { state: 'ahead', detail: null }
  }
  return { state: 'up-to-date', detail: null }
}

/**
 * 「更新」的决策。
 *
 * ⚠️ `diverged` 必须排在 `dirty` 之前：已经分叉时快进**永远不可能成功**，
 * 先报"你本地有改动"会让人以为把改动收起来就能更新。
 */
export type UpdateDecision =
  | { action: 'update' }
  | { action: 'up-to-date' }
  | { action: 'refuse'; kind: LocalUpdateKind; detail: string }
  | { action: 'fail'; detail: string }

export function decideUpdate(probe: SyncProbe): UpdateDecision {
  if (!probe.pathExists) {
    return { action: 'refuse', kind: 'refused-path', detail: '磁盘上已找不到这个目录' }
  }
  if (!probe.identityMatches) {
    return {
      action: 'refuse',
      kind: 'refused-path',
      detail: '目录名与仓库名不符，拒绝在无法确认的目录上执行更新'
    }
  }
  if (!probe.isGitWorktree) {
    return { action: 'refuse', kind: 'refused-path', detail: '目录存在，但不是 git 工作树' }
  }
  if (probe.fatalError !== null) {
    return { action: 'fail', detail: probe.fatalError }
  }
  if (probe.branch === null) {
    return { action: 'fail', detail: '读不到当前分支' }
  }
  if (probe.branch === 'HEAD') {
    return {
      action: 'refuse',
      kind: 'refused-detached',
      detail: '当前处于游离 HEAD，没有分支可以快进'
    }
  }
  if (probe.upstream === null) {
    return {
      action: 'refuse',
      kind: 'refused-no-upstream',
      detail: `分支 ${probe.branch} 没有跟踪分支`
    }
  }
  // 与 classifyLocalSync 同序：fetch 失败必须排在"差异读不到"之前，
  // 否则网络故障会被说成一个含糊的解析错误。
  if (probe.fetchError !== null) {
    return { action: 'fail', detail: probe.fetchError }
  }
  if (probe.ahead === null || probe.behind === null) {
    return { action: 'fail', detail: '读不到与上游的提交差异' }
  }
  if (probe.ahead > 0 && probe.behind > 0) {
    return {
      action: 'refuse',
      kind: 'refused-diverged',
      detail: `本地与上游都有各自的提交（领先 ${probe.ahead}、落后 ${probe.behind}），快进无法完成`
    }
  }
  // dirty 只在**真的会拉东西**时才是拒绝理由。落后 0 时什么都没得拉，此时报
  // "本地有未提交的改动"会把一个无事可做的仓库说成一次被拒绝的更新；
  // 那种仓库的正确结论是 up-to-date（dirty 会原样留在 status 里、由徽章显示成
  // 「已是最新 · 有本地改动」），信息一点没丢。
  if (probe.behind > 0) {
    if (probe.dirty === null) {
      return { action: 'fail', detail: '读不到工作区状态' }
    }
    if (probe.dirty) {
      return {
        action: 'refuse',
        kind: 'refused-dirty',
        detail: '本地有未提交的改动，已保留你的修改，未做更新'
      }
    }
    return { action: 'update' }
  }
  return { action: 'up-to-date' }
}

/**
 * 解析 `git rev-list --left-right --count HEAD...@{u}` 的输出。
 *
 * git 的输出形如 `"0\t3"`：左 = 只有 HEAD 有的提交（领先），右 = 只有上游有的
 * （落后）。**切不出恰好两个非负整数就返回 null，不猜**——宁可在界面上说
 * "读不到差异"，也不要拿一个来路不明的数字当落后数。
 */
export function parseAheadBehind(raw: string): { ahead: number; behind: number } | null {
  const parts = raw.trim().split(/[ \t]+/)
  if (parts.length !== 2) return null
  if (!parts.every((p) => /^\d+$/.test(p))) return null
  const ahead = Number(parts[0])
  const behind = Number(parts[1])
  if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) return null
  return { ahead, behind }
}
