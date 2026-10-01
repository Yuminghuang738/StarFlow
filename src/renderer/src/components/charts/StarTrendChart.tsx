import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { useRepoStore } from '../../store/repoStore'
import { Card } from '../common/Card'

const DAY = 86_400_000

const TEXT_COLOR = '#cbd5e1'
const SPLIT_COLOR = 'rgba(148,163,184,0.15)'
const AXIS_COLOR = 'rgba(148,163,184,0.35)'
const LINE_COLOR = '#38bdf8'

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

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: 'transparent',
      grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params]
          const p = arr[0] as { axisValue?: string; value?: number } | undefined
          return `${p?.axisValue ?? ''}<br/>新增 ${p?.value ?? 0} 个`
        },
        borderColor: SPLIT_COLOR,
        backgroundColor: '#0f172a',
        textStyle: { color: TEXT_COLOR, fontSize: 12 }
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: series.map((s) => s.label),
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisTick: { show: false },
        axisLabel: { color: TEXT_COLOR, fontSize: 12 }
      },
      yAxis: {
        type: 'value',
        minInterval: 1, // 数量是整数，避免出现 0.5 这种刻度
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: SPLIT_COLOR } },
        axisLabel: { color: TEXT_COLOR, fontSize: 12 }
      },
      series: [
        {
          type: 'line',
          smooth: true,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2, color: LINE_COLOR },
          itemStyle: { color: LINE_COLOR, borderColor: '#0f172a', borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(56,189,248,0.45)' },
              { offset: 1, color: 'rgba(56,189,248,0.02)' }
            ])
          },
          data: series.map((s) => s.count)
        }
      ]
    }),
    [series]
  )

  return (
    <Card className="overflow-hidden">
      <h3 className="text-sm font-medium text-slate-200">近 7 天新增</h3>
      <div className="mt-2 h-[280px] overflow-hidden">
        {repos.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
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
