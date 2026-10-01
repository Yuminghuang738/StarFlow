import type { EChartsOption } from 'echarts'
import type { ChartPalette } from './chartTheme'

/**
 * 图表 option 的纯构造函数。
 *
 * 全部是**纯函数**：只吃数据 + 色板，不订阅 store、不读 DOM。这样主题切换只需要
 * 重算色板、组件用 useMemo 依赖 palette 重跑一次即可，也让这些构造函数在没有
 * 渲染环境的脚本里能直接调。
 *
 * ⚠️ 口径提醒：`starTrendLineOption` 的 x 轴标签由调用方按 **UTC** 分桶后传入
 * （见 StarTrendChart 与主进程 report.ts 的 dateKey）。这里只负责画，不碰时区。
 */

export interface PieDatum {
  name: string
  value: number
}

/** 折线面积渐变。用普通对象而不是 `echarts.graphic.LinearGradient`，免得把整个 echarts 拖进这个模块。 */
interface AreaGradient {
  type: 'linear'
  x: number
  y: number
  x2: number
  y2: number
  colorStops: { offset: number; color: string }[]
  global: boolean
}

function areaGradient(top: string, bottom: string): AreaGradient {
  return {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom }
    ],
    global: false
  }
}

/** tooltip 的统一外观，四个图共用 */
function tooltipBase(palette: ChartPalette): EChartsOption['tooltip'] {
  return {
    backgroundColor: palette.tooltipBg,
    borderColor: palette.split,
    textStyle: { color: palette.text, fontSize: 12 }
  }
}

// ---------------------------------------------------------------------------
// 总览页
// ---------------------------------------------------------------------------

/**
 * 语言分布环形图。
 * tooltip 里现算百分比：数据是"语言 → 仓库数"，总数必须按**当前图上的**扇区求和，
 * 不能拿 repos.length——超过 8 种语言时尾部会并成「其它」，两者不相等。
 */
export function languageDistributionOption(
  data: PieDatum[],
  palette: ChartPalette
): EChartsOption {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return {
    backgroundColor: 'transparent',
    color: palette.series,
    textStyle: { color: palette.text },
    tooltip: {
      ...tooltipBase(palette),
      trigger: 'item',
      formatter: (params) => {
        const p = params as { name?: string; value?: number }
        const value = typeof p.value === 'number' ? p.value : 0
        const pct = total === 0 ? 0 : (value / total) * 100
        return `${p.name ?? ''}<br/>${value} 个 · ${pct.toFixed(1)}%`
      }
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'middle',
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: palette.text, fontSize: 12 }
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        // 扇区之间留描边，颜色取表面色，做出被"挖掉一条缝"的观感
        itemStyle: { borderColor: palette.pieBorder, borderWidth: 2 },
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
}

/** 近 7 天新增 Star 折线（面积渐变）。labels 是 'MM-DD'，已按 UTC 排好序、无断点。 */
export function starTrendLineOption(
  labels: string[],
  counts: number[],
  palette: ChartPalette
): EChartsOption {
  const line = palette.series[1] ?? palette.series[0] ?? palette.text

  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
    textStyle: { color: palette.text },
    tooltip: {
      ...tooltipBase(palette),
      trigger: 'axis',
      formatter: (params) => {
        const arr = Array.isArray(params) ? params : [params]
        const p = arr[0] as { axisValue?: string; value?: number } | undefined
        return `${p?.axisValue ?? ''}<br/>新增 ${p?.value ?? 0} 个`
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: palette.axis } },
      axisTick: { show: false },
      axisLabel: { color: palette.text, fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1, // 数量是整数，避免出现 0.5 这种刻度
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: palette.split } },
      axisLabel: { color: palette.text, fontSize: 12 }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2, color: line },
        itemStyle: { color: line, borderColor: palette.pieBorder, borderWidth: 2 },
        areaStyle: { color: areaGradient(palette.areaTop, palette.areaBottom) },
        data: counts
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// 周报页
// ---------------------------------------------------------------------------

/**
 * 周报的语言分布环形图。
 *
 * 与总览页那张**刻意不共用**一个函数：周报不合并「其它」，图例在底部且可滚动，
 * 因为它是导出用的、要能看全。共用一个函数就得加一堆开关参数，反而更难读。
 */
export function weeklyLanguageOption(data: PieDatum[], palette: ChartPalette): EChartsOption {
  return {
    backgroundColor: 'transparent',
    color: palette.series,
    textStyle: { color: palette.text },
    tooltip: { ...tooltipBase(palette), trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll', textStyle: { color: palette.text } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: palette.pieBorder, borderWidth: 2 },
        label: { show: false },
        data
      }
    ]
  }
}

/** 周报的本周新增柱状图。labels 是 UTC 的 'YYYY-MM-DD'，调用方已排序。 */
export function weeklyTrendBarOption(
  labels: string[],
  counts: number[],
  palette: ChartPalette
): EChartsOption {
  const bar = palette.series[1] ?? palette.series[0] ?? palette.text

  return {
    backgroundColor: 'transparent',
    textStyle: { color: palette.text },
    grid: { left: 32, right: 16, top: 16, bottom: 28 },
    tooltip: { ...tooltipBase(palette), trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: palette.axis },
      axisLine: { lineStyle: { color: palette.axis } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: palette.axis },
      splitLine: { lineStyle: { color: palette.split } }
    },
    series: [
      {
        type: 'bar',
        data: counts,
        itemStyle: { color: bar, borderRadius: [4, 4, 0, 0] }
      }
    ]
  }
}
