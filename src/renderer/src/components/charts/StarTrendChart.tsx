import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useRepoStore } from '../../store/repoStore'
import { RECENT_WINDOW_DAYS, starTrendBuckets } from '../../lib/collectionStats'
import { Card } from '../common/Card'
import { useChartTheme } from './chartTheme'
import { starTrendLineOption } from './options'

/**
 * 最近 RECENT_WINDOW_DAYS 天新增 Star 趋势图。
 *
 * ⚠️ 口径：全程 UTC。Repo.starred_at 是 UTC 的 ISO 8601，主进程 report.ts 也用
 * utcDayKey 分桶。如果这里改成按本地时区分桶，东八区晚上 star 的记录会被算到
 * 前一天，图上数字就和周报、和「本周新增」那张卡都对不上。
 *
 * 分桶逻辑在 lib/collectionStats.ts 的 starTrendBuckets 里，不在组件里渲染时现写：
 * 它与「本周新增」卡片、列表的「只看最近 N 天新增」共用同一个 RECENT_WINDOW_DAYS，
 * 而"图上加起来 = 卡片上的数"这件事只能在纯函数上断言——渲染进程没有 DOM 测试环境。
 *
 * 数据直接从 repos 现算（不依赖 report.dailyStarCount 的 IPC 往返），
 * 这样同步数据后图表会立刻跟着重绘。
 */
export function StarTrendChart(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const palette = useChartTheme()

  // 时钟与分桶一起算进同一个 useMemo：纯函数仍然显式接收 now（自检可以喂固定时间），
  // 而时间戳作为**计算结果的一部分**返回，依赖数组里就不会出现用不到的 repos 之外的项。
  const series = useMemo(() => starTrendBuckets(repos, Date.now()), [repos])

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
      {/* 标题里的天数与卡片、筛选同源：写死"7 天"的话，窗口一改这块就开始撒谎 */}
      <h3 className="text-sm font-medium text-fg">近 {RECENT_WINDOW_DAYS} 天新增</h3>
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