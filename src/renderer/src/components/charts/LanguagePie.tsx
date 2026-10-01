import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useRepoStore } from '../../store/repoStore'
import { Card } from '../common/Card'
import { useChartTheme } from './chartTheme'
import { languageDistributionOption } from './options'

const OTHER_KEY = '其它'
const MAX_SLICES = 8

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
  const palette = useChartTheme()

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

  const option = useMemo(
    () => languageDistributionOption(data, palette),
    [data, palette]
  )

  return (
    <Card className="overflow-hidden">
      <h3 className="text-sm font-medium text-fg">语言分布</h3>
      <div className="mt-2 h-[280px] overflow-hidden">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
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
