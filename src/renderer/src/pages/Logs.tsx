import { useCallback, useEffect, useRef, useState } from 'react'
import type { LogEntry, LogSnapshot } from '@shared/types'
import { cn } from '../lib/cn'
import { useNav } from '../components/layout/NavContext'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { EmptyState } from '../components/common/EmptyState'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'

/**
 * 轮询间隔。日志读的是一块进程内内存（主进程 logBuffer 的环状缓冲），不是网络，
 * 所以可以打得比别处勤；1.2s 已经足够"刚出问题就能看见"，又不至于每秒重渲染一次。
 */
const POLL_MS = 1200

/**
 * 各档日志的配色。
 *
 * `log` 刻意最淡：主进程大量使用 console.log 做流程记录，它们是"背景"；
 * 真正要一眼看见的是 warn / error。四档都给足对比度差异，但不用 `bg-*` 色块——
 * 一屏几百行，色块会变成噪点。
 */
const LEVEL_CLASS: Record<LogEntry['level'], string> = {
  log: 'text-fg-subtle',
  info: 'text-link',
  warn: 'text-warning',
  error: 'text-danger'
}

function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // toLocaleTimeString 的秒是补零的；hour12:false 在中文环境下给 24 小时制
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

/**
 * 显示用的消息文本。
 *
 * 缓冲里的 message **保留了** `[main]` 这类前缀（不是漏剥，是刻意留着：复制出去时
 * 带来源更好查）。但这里已经把 scope 单独渲染成一枚标签了，不再重复画一遍前缀——
 * 只做显示层剥离，不动那份快照本身。
 */
function bodyOf(entry: LogEntry): string {
  if (entry.scope === null) return entry.message
  const prefix = `[${entry.scope}]`
  return entry.message.startsWith(prefix) ? entry.message.slice(prefix.length).trimStart() : entry.message
}

/**
 * 运行日志：把主进程 console 的镜像缓冲显示出来。
 *
 * ⚠️ 三条刻意为之的约定：
 *   1. **只在本页可见时轮询**。页面是保活的（切走只是 display:none，不卸载），组件
 *      自己察觉不到"我是不是被看见了"，所以用 useNav().current 判断：切走就清掉
 *      interval，绝不在后台常驻轮询。
 *   2. **轮询失败不弹 toast**。一秒一次的调用用一个弹一次，失败时用户会被刷屏。
 *      这里只留一行就地说明，并明确告诉用户下面那份列表是**上一次成功**的快照。
 *   3. **丢了多少条必须说出来**。缓冲上限 500，被挤掉的条数由主进程如实上报；
 *      装作日志是连续的，就等于让用户拿着残缺的线索去排查问题。
 */
export function Logs(): React.JSX.Element {
  const { current } = useNav()
  const active = current === 'logs'

  const [snapshot, setSnapshot] = useState<LogSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const listRef = useRef<HTMLDivElement | null>(null)
  // 上一次请求还没回来就跳过这一轮：日志虽然读的是内存，但慢一拍的响应会让
  // 后到的旧快照盖掉新快照（seq 倒退，界面上看着像日志消失了）
  const inFlightRef = useRef(false)

  const pull = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      // 裸调 + 自己判 ok：这是一条轮询通道，失败不能弹 toast（见上面第 2 条）
      const res = await window.api.log.tail()
      if (res.ok) {
        setSnapshot(res.data)
        setError(null)
      } else {
        setError(res.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!active) return
    // 进页面立刻拉一次，之后按固定间隔拉；切走时清掉定时器
    void pull()
    const timer = window.setInterval(() => void pull(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [active, pull])

  const entries = snapshot?.entries ?? []

  // 新条目到达后滚到底。只在用户本来就贴着底部时滚：他已经翻到上面去看某一行时
  // 被强行拽回底部，比不滚更烦人。
  useEffect(() => {
    if (!autoScroll) return
    const el = listRef.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
  }, [autoScroll, snapshot])

  function onListScroll(): void {
    const el = listRef.current
    if (el === null) return
    // 距底部 24px 以内都算"贴着底"，留一点余量给亚像素与滚动惯性
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
  }

  async function onClear(): Promise<void> {
    setClearOpen(false)
    setClearing(true)
    try {
      const res = await window.api.log.clear()
      if (!res.ok) {
        setError(res.error)
        return
      }
      // 清完立刻重拉一次，否则界面上还挂着刚被清掉的那一屏
      await pull()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setClearing(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        tab="logs"
        title="运行日志"
        subtitle="主进程这一路做了什么、错在哪。渲染进程自己的日志不在这里，在开发者工具的控制台里"
        suffix={
          snapshot === null ? undefined : (
            <span className="rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-fg-muted">
              共 {snapshot.total} 条
              {snapshot.dropped > 0 ? ` · 已丢弃 ${snapshot.dropped}` : ''}
            </span>
          )
        }
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary-solid"
              />
              自动滚动
            </label>
            <Button size="sm" onClick={() => void pull()}>
              刷新
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={clearing || entries.length === 0}
              onClick={() => setClearOpen(true)}
            >
              {clearing ? '清空中…' : '清空'}
            </Button>
          </>
        }
      />

      {/* 轮询失败：就地说明，且必须点明下面那份列表是旧的——不然一屏日志看着一切正常，
          用户以为这就是此刻的现场 */}
      {error === null ? null : (
        <Card className="border-danger/40">
          <p className="text-sm text-danger">读日志失败：{error}</p>
          <p className="mt-1 text-xs text-fg-subtle">
            {snapshot === null
              ? '还没有读到任何日志。'
              : `下面显示的是上一次成功读到的 ${snapshot.entries.length} 条，可能已经过时。`}
          </p>
        </Card>
      )}

      {snapshot === null ? (
        error === null ? (
          <p className="text-sm text-fg-subtle">读取中…</p>
        ) : null
      ) : entries.length === 0 ? (
        <EmptyState
          title="还没有日志"
          description="主进程一有动作就会往这里写。去别的板块点几下，再回来看"
          action={
            <Button size="sm" variant="ghost" onClick={() => void pull()}>
              刷新
            </Button>
          }
        />
      ) : (
        <Card className="p-0">
          {/* 自己滚动的容器，而不是让整页跟着滚：自动滚动只该动日志这一块 */}
          <div
            ref={listRef}
            onScroll={onListScroll}
            className="max-h-[62vh] overflow-y-auto font-mono text-xs leading-relaxed [scrollbar-gutter:stable]"
          >
            {entries.map((e) => (
              <div
                key={e.seq}
                className="flex items-start gap-3 border-b border-border/60 px-3 py-1.5 last:border-b-0 hover:bg-surface-2/40"
              >
                <span className="shrink-0 tabular-nums text-fg-subtle">{clockOf(e.at)}</span>
                <span
                  className={cn('w-11 shrink-0 uppercase', LEVEL_CLASS[e.level])}
                  title={`级别：${e.level}`}
                >
                  {e.level}
                </span>
                {e.scope === null ? null : (
                  <span className="shrink-0 text-primary" title="日志来源">
                    [{e.scope}]
                  </span>
                )}
                {/* 允许选中复制：排查问题时这几行多半要被贴到别处去 */}
                <span className="min-w-0 flex-1 select-text whitespace-pre-wrap break-words text-fg-muted">
                  {bodyOf(e)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={clearOpen}
        danger
        title="清空日志？"
        description="只清掉这一栏显示的缓冲（内存里的这份），终端里已经打出来的、以及磁盘上的任何东西都不受影响。此操作不可撤销。"
        confirmText="清空"
        onConfirm={() => void onClear()}
        onCancel={() => setClearOpen(false)}
      />
    </PageContainer>
  )
}
