import { useEffect, useState } from 'react'
import { useTheme } from '../../lib/theme'

/**
 * 图表色板。
 *
 * echarts 读不了 Tailwind 类，所以它需要的那几个颜色必须由 JS 拿到手。这里**不另建
 * 一份 JS 色板**——那样 CSS 和图表迟早会漂移。做法是让 index.css 里的 `--c-chart-*`
 * 成为唯一来源，这里用 getComputedStyle 读回同一批变量。
 *
 * 这也是 tailwind.config.js 里颜色值必须写成**空格分隔的 RGB 三元组**的原因之一：
 * 既让 `bg-surface/60` 的透明度修饰符能用，也便于这里拼回 CSS 颜色。
 */

export interface ChartPalette {
  /** 坐标轴标签 / 图例 / tooltip 正文 */
  text: string
  /** 轴线本身 */
  axis: string
  /** 分割线与 tooltip 描边 */
  split: string
  tooltipBg: string
  /** 环形图扇区之间、折线节点的描边色——取表面色，做出"挖空"的观感 */
  pieBorder: string
  series: string[]
  /** 折线面积渐变的上下两端 */
  areaTop: string
  areaBottom: string
}

/**
 * CSS 变量取不到时的兜底。正常路径不会走到——index.css 里这 8 个系列色两套主题都给了值。
 * 存在的意义是：万一有人删了变量，图表是"颜色不对"而不是"整页白屏"。
 */
const FALLBACK: ChartPalette = {
  text: 'rgb(100, 116, 139)',
  axis: 'rgb(148, 163, 184)',
  split: 'rgb(226, 232, 240)',
  tooltipBg: 'rgb(255, 255, 255)',
  pieBorder: 'rgb(255, 255, 255)',
  series: ['rgb(79, 70, 229)'],
  areaTop: 'rgba(99, 102, 241, 0.38)',
  areaBottom: 'rgba(99, 102, 241, 0.02)'
}

const SERIES_KEYS = [
  '--c-chart-series-1',
  '--c-chart-series-2',
  '--c-chart-series-3',
  '--c-chart-series-4',
  '--c-chart-series-5',
  '--c-chart-series-6',
  '--c-chart-series-7',
  '--c-chart-series-8'
] as const

/**
 * 三元组 → CSS 颜色。
 *
 * 刻意输出**逗号分隔**的 `rgb(r, g, b)` 而不是 CSS Color 4 的空格分隔写法：
 * zrender 的取色解析器对空格分隔的 rgb() 支持并不可靠，逗号形式才是稳的。
 */
function toCss(value: string, fallback: string): string {
  const v = value.trim()
  if (v === '') return fallback
  // 已经是完整颜色字面量（`--c-chart-area-*` 存的就是 rgba(...)）
  if (v.startsWith('#') || v.startsWith('rgb')) return v

  const parts = v.split(/[\s,]+/).filter((p) => p !== '')
  if (parts.length !== 3) return fallback
  return `rgb(${parts.join(', ')})`
}

/**
 * 同步读取当前生效的色板。
 *
 * 在 `<html>` 上取样式：`.dark` 挂的就是 documentElement，自定义属性会从 `:root`
 * 继承到 html，所以两套主题的值都能在这里读到。getComputedStyle 会强制样式重算，
 * 因此切换类名之后再读，拿到的就是新主题的值。
 */
export function readPalette(): ChartPalette {
  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string): string =>
    toCss(styles.getPropertyValue(name), fallback)

  const series: string[] = []
  for (const key of SERIES_KEYS) {
    const color = toCss(styles.getPropertyValue(key), '')
    if (color !== '') series.push(color)
  }

  return {
    text: read('--c-chart-text', FALLBACK.text),
    axis: read('--c-chart-axis', FALLBACK.axis),
    split: read('--c-chart-split', FALLBACK.split),
    tooltipBg: read('--c-chart-tooltip-bg', FALLBACK.tooltipBg),
    pieBorder: read('--c-chart-pie-border', FALLBACK.pieBorder),
    series: series.length > 0 ? series : FALLBACK.series,
    areaTop: read('--c-chart-area-top', FALLBACK.areaTop),
    areaBottom: read('--c-chart-area-bottom', FALLBACK.areaBottom)
  }
}

/** 两份色板是否一模一样。用途见 useChartTheme：避免用等价的新对象白触发一次重渲染。 */
function isSamePalette(a: ChartPalette, b: ChartPalette): boolean {
  if (
    a.text !== b.text ||
    a.axis !== b.axis ||
    a.split !== b.split ||
    a.tooltipBg !== b.tooltipBg ||
    a.pieBorder !== b.pieBorder ||
    a.areaTop !== b.areaTop ||
    a.areaBottom !== b.areaBottom ||
    a.series.length !== b.series.length
  ) {
    return false
  }
  return a.series.every((c, i) => c === b.series[i])
}

/**
 * 主题切换后自动重算的色板。
 *
 * 依赖的是 `resolved`（'light' | 'dark'）而不是 `choice`：用户从 'dark' 切到 'system'
 * 而系统恰好也是深色时，DOM 没变、颜色也不该重算。
 *
 * 时序上必须在 effect 里读而不是在 render 里读——render 阶段类名可能还没落到 `<html>` 上
 * （paint 是先画 DOM 再通知订阅者的，但仍然以 effect 为准更稳）。
 *
 * 回写前先比一遍：effect 在挂载时也会跑一次，无条件 set 会用一个内容相同的新对象
 * 触发重渲染，白让 echarts 重绘一次 canvas。
 */
export function useChartTheme(): ChartPalette {
  const { resolved } = useTheme()
  const [palette, setPalette] = useState<ChartPalette>(readPalette)

  useEffect(() => {
    setPalette((prev) => {
      const next = readPalette()
      return isSamePalette(prev, next) ? prev : next
    })
  }, [resolved])

  return palette
}
