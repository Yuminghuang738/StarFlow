import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useRepoStore } from '../../store/repoStore'
import { Card } from '../common/Card'
import { useChartTheme } from './chartTheme'
import { starTrendLineOption } from './options'

const DAY = 86_400_000

/** UTC 日期 key，口径与主进程 report.ts 的 dateKey 完全一致 */
function dateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * 近 7 天新增 Star 趋势图。
 *
 * ⚠️ 口径：全程 UTC。Repo.starred_at 是 UTC 的 ISO 8601，主进程 report.ts 也用
 * dateKey = toISOString().slice(0,10) 分桶。如果这里改成按本地时区分桶，
 * 东八区晚上 star 的记录会被算到前一天，图上数字就和周报对不上。
 *
 * 数据由 useMemo 直接从 repos 现算（不依赖 report.dailyStarCount 的 IPC 往返），
 * 这样同步数据后图表会立刻跟着重绘，且分桶逻辑与 report.ts 保持同一套 UTC 算法。
 */
export function StarTrendChart(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const palette = useChartTheme()

  const series = useMemo(() => {
    const now = new Date()
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

    // 从 6 天前到今天，7 个连续 UTC 日期，缺的补 0（否则折线会断点）
    const buckets: { key: string; label: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const key = dateKey(todayStart - i * DAY)
      buckets.push({ key, label: key.slice(5), count: 0 }) // 'MM-DD'，已补零
    }

    const index = new Map(buckets.map((b, i) => [b.key, i]))
    for (const r of repos) {
      const t = new Date(r.starred_at).getTime()
      if (!Number.isFinite(t)) continue
      const i = index.get(dateKey(t))
      if (i !== undefined) {
        const bucket = buckets[i]
        if (bucket) bucket.count += 1
      }
    }

    return buckets
  }, [repos])

  const option = useMemo(
    () =>
      starTrendLineOption(
        series.map((s) => s.label),
        series.map((s) => s.count),
        palette
      ),
    [series, palette]
  )

  return (
    <Card className="overflow-hidden">
      <h3 className="text-sm font-medium text-fg">近 7 天新增</h3>
      <div className="mt-2 h-[280px] overflow-hidden">
        {repos.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
            暂无数据
          </div>
        ) : (
          <ReactECharts
            option={option}
            style={{ height: 280 }}
            opts={{ renderer: 'canvas' }}
            notMerge
          />
        )}
      </div>
    </Card>
  )
}
