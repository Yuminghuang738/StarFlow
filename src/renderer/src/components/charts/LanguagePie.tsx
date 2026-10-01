import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useRepoStore } from '../../store/repoStore'
import { Card } from '../common/Card'

/** 语言色板：与 RepoCard 的语言色块取色逻辑独立，这里只负责饼图的可读性 */
const PIE_PALETTE = [
  '#38bdf8',
  '#818cf8',
  '#f472b6',
  '#fb923c',
  '#facc15',
  '#4ade80',
  '#2dd4bf',
  '#a78bfa',
  '#94a3b8'
]

const OTHER_KEY = '其它'
const MAX_SLICES = 8

const TEXT_COLOR = '#cbd5e1'
const SPLIT_COLOR = 'rgba(148,163,184,0.15)'

interface Slice {
  name: string
  value: number
}

/**
 * 语言分布环形图。
 * 取数：repos 按 language 聚合（null 记为「未知」），降序取前 8，其余合并成「其它」。
 * mock 数据有 9 种语言 + 2 条 null = 10 个 key，按规则会得到 9 个扇区（前 8 + 其它）。
 */
export function LanguagePie(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)

  const data = useMemo<Slice[]>(() => {
    const counts = new Map<string, number>()
    for (const r of repos) {
      const key = r.language ?? '未知'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const sorted = [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))

    if (sorted.length <= MAX_SLICES) return sorted

    const head = sorted.slice(0, MAX_SLICES)
    // 注意边界：正好等于 MAX_SLICES 时不合并，超过时尾部全部并入「其它」
    const restTotal = sorted.slice(MAX_SLICES).reduce((sum, s) => sum + s.value, 0)
    return [...head, { name: OTHER_KEY, value: restTotal }]
  }, [repos])

  const option = useMemo<EChartsOption>(() => {
    const total = data.reduce((sum, d) => sum + d.value, 0)

    return {
      backgroundColor: 'transparent',
      color: PIE_PALETTE,
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          const p = params as { name?: string; value?: number }
          const value = typeof p.value === 'number' ? p.value : 0
          const pct = total === 0 ? 0 : (value / total) * 100
          return `${p.name ?? ''}<br/>${value} 个 · ${pct.toFixed(1)}%`
        },
        borderColor: SPLIT_COLOR,
        backgroundColor: '#0f172a',
        textStyle: { color: TEXT_COLOR, fontSize: 12 }
      },
      legend: {
        orient: 'vertical',
        right: 0,
        top: 'middle',
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: TEXT_COLOR, fontSize: 12 }
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['38%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#0f172a', borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: { show: false }
          },
          data
        }
      ]
    }
  }, [data])

  return (
    <Card className="overflow-hidden">
      <h3 className="text-sm font-medium text-slate-200">语言分布</h3>
      <div className="mt-2 h-[280px] overflow-hidden">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            暂无语言数据
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
