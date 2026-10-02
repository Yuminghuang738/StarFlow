import type { LocalSyncStatus } from '@shared/types'
import { useRepoStore } from '../../store/repoStore'
import { Badge } from '../common/Badge'
import { formatRelative } from './repoFormat'

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'muted'

/**
 * 状态 -> 文案与色调。
 *
 * ⚠️ 这里每个状态都必须有**自己**的说法，尤其：
 *   - 「未检查」不能画成「已是最新」——键不存在时返回的就是它，重启后所有仓库都是这个态；
 *   - 「检查失败」不能画成「已是最新」——fetch 没成功就不知道落后多少，必须说出来；
 *   - 数字一律来自后端，`null` 只会出现在本来就不该有数字的状态里。
 */
function viewOf(status: LocalSyncStatus | undefined): { text: string; tone: Tone } {
  if (!status || status.state === 'unchecked') {
    return { text: '未检查', tone: 'muted' }
  }
  switch (status.state) {
    case 'up-to-date':
      return status.dirty
        ? { text: '已是最新 · 有本地改动', tone: 'success' }
        : { text: '已是最新', tone: 'success' }
    case 'behind':
      return { text: `落后上游 ${status.behind ?? 0} 个提交`, tone: 'warning' }
    case 'ahead':
      return { text: `领先上游 ${status.ahead ?? 0} 个提交`, tone: 'muted' }
    case 'diverged':
      return {
        text: `已分叉（本地 +${status.ahead ?? 0} / 上游 +${status.behind ?? 0}）`,
        tone: 'danger'
      }
    case 'no-upstream':
      return { text: '无上游分支', tone: 'muted' }
    case 'detached':
      return { text: '游离 HEAD', tone: 'muted' }
    case 'missing-on-disk':
      return { text: '本地副本不存在', tone: 'warning' }
    case 'not-git':
      return { text: '不是 Git 仓库', tone: 'danger' }
    case 'path-mismatch':
      return { text: '目录与仓库名不符', tone: 'danger' }
    default:
      return { text: '检查失败', tone: 'danger' }
  }
}

/**
 * 已 clone 仓库的同步状态徽章。只在有 cloned_path 的行上渲染（由调用方保证），
 * 订阅的是 `syncByRepo[fullName]` 这一个键：拿到的要么是同一个对象引用、
 * 要么是 undefined，不会因为别的仓库变化而跟着重渲染。
 */
export function SyncBadge({ fullName }: { fullName: string }): React.JSX.Element {
  const status = useRepoStore((s) => s.syncByRepo[fullName])
  const view = viewOf(status)

  const tips: string[] = [
    status?.checkedAt ? `检查于 ${formatRelative(status.checkedAt)}` : '还没有检查过'
  ]
  if (status?.detail) tips.push(status.detail)

  return (
    <span title={tips.join(' · ')}>
      <Badge tone={view.tone}>{view.text}</Badge>
    </span>
  )
}
