import { useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { WeeklyReport } from '@shared/types'
import { unwrap, ipcErrorMessage, formatStars } from '../lib/api'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { EmptyState } from '../components/common/EmptyState'

/**
 * 'YYYY-MM-DD'（UTC 口径）→ 'M月D日'。
 * 纯字符串切分，不经过 Date、不引入本地时区，避免东八区把日期归错天。
 */
function formatMonthDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(m)}月${Number(d)}日`
}

/** 在渲染进程本地拼 Markdown，不动主进程、不加 IPC 通道。 */
function buildMarkdown(report: WeeklyReport): string {
  const lines: string[] = []
  lines.push('# StarPilot 周报')
  lines.push('')
  lines.push(`- 周期：${report.weekStart.slice(0, 10)} ~ ${report.weekEnd.slice(0, 10)}`)
  lines.push(`- 本周新增：${report.newStars.length} 个`)
  lines.push('')
  lines.push('## AI 总结')
  lines.push('')
  lines.push(report.aiSummary)
  lines.push('')
  lines.push('## 语言分布')
  lines.push('')
  lines.push('| 语言 | 数量 |')
  lines.push('| --- | --- |')
  for (const [lang, count] of Object.entries(report.languageStats)) {
    lines.push(`| ${lang} | ${count} |`)
  }
  lines.push('')
  lines.push('## Top 5 项目')
  lines.push('')
  lines.push('| 排名 | 仓库 | 语言 | Star |')
  lines.push('| --- | --- | --- | --- |')
  report.topRepos.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.full_name} | ${r.language ?? '-'} | ${r.stargazers_count} |`)
  })
  lines.push('')
  lines.push('## 本周新增')
  lines.push('')
  for (const r of report.newStars) {
    const lang = r.language ? `（${r.language}）` : ''
    lines.push(`- [${r.full_name}](${r.html_url})${lang}`)
  }
  lines.push('')
  return lines.join('\n')
}

/** Blob + URL.createObjectURL + <a download> 触发下载，下载后 revoke。 */
function downloadMarkdown(report: WeeklyReport): void {
  const md = buildMarkdown(report)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `starpilot-weekly-${report.weekStart.slice(0, 10)}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 语言分布环形图。周报页图表独立，内联 option，不 import P5 的 components/charts/**。 */
function buildLangOption(report: WeeklyReport): EChartsOption {
  const data = Object.entries(report.languageStats).map(([name, value]) => ({ name, value }))
  return {
    textStyle: { color: '#cbd5e1' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll', textStyle: { color: '#cbd5e1' } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#0f172a', borderWidth: 2 },
        label: { show: false },
        data
      }
    ]
  }
}

/** 本周新增趋势柱状图：dailyStarCount 按 key 排序，7 个点。key 是主进程 report.ts 的 UTC 口径。 */
function buildTrendOption(report: WeeklyReport): EChartsOption {
  const keys = Object.keys(report.dailyStarCount).sort()
  return {
    textStyle: { color: '#cbd5e1' },
    grid: { left: 32, right: 16, top: 16, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: keys,
      axisLabel: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#1e293b' } }
    },
    series: [
      {
        type: 'bar',
        data: keys.map((k) => report.dailyStarCount[k]),
        itemStyle: { color: '#38bdf8', borderRadius: [4, 4, 0, 0] }
      }
    ]
  }
}

export function Report(): React.JSX.Element {
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setReport(await unwrap(window.api.report.generate()))
    } catch (e) {
      setError(ipcErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">周报</h1>
          {report ? (
            <p className="mt-1 text-sm text-slate-400">
              {formatMonthDay(report.weekStart)} ~ {formatMonthDay(report.weekEnd)}
            </p>
          ) : null}
        </div>
        {report ? (
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void generate()} loading={loading}>
              重新生成
            </Button>
            <Button onClick={() => downloadMarkdown(report)}>导出 Markdown</Button>
          </div>
        ) : (
          <Button variant="primary" onClick={() => void generate()} loading={loading}>
            生成本周周报
          </Button>
        )}
      </header>

      {error ? (
        <Card className="mt-4 border-red-900 bg-red-950/40 text-sm text-red-300">
          <p className="mb-3">生成失败：{error}</p>
          <Button onClick={() => void generate()}>重试</Button>
        </Card>
      ) : null}

      {report ? (
        <>
          <div className="mt-4 flex gap-3">
            <Card className="flex-1">
              <div className="text-3xl font-semibold tabular-nums text-sky-400">
                {report.newStars.length}
              </div>
              <div className="mt-1 text-sm text-slate-400">本周新增 Star</div>
            </Card>
            <Card className="flex-1">
              <div className="text-3xl font-semibold tabular-nums">
                {Object.keys(report.languageStats).length}
              </div>
              <div className="mt-1 text-sm text-slate-400">语言分布种类</div>
            </Card>
            <Card className="flex-1">
              <div className="text-3xl font-semibold tabular-nums">{report.topRepos.length}</div>
              <div className="mt-1 text-sm text-slate-400">Top 项目</div>
            </Card>
          </div>

          <Card className="mt-4">
            <h2 className="text-sm font-medium text-slate-200">AI 总结</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
              {report.aiSummary}
            </p>
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <h2 className="text-sm font-medium text-slate-200">语言分布</h2>
              <ReactECharts option={buildLangOption(report)} style={{ height: 260 }} />
            </Card>
            <Card>
              <h2 className="text-sm font-medium text-slate-200">本周新增趋势</h2>
              <ReactECharts option={buildTrendOption(report)} style={{ height: 260 }} />
            </Card>
          </div>

          <Card className="mt-4">
            <h2 className="text-sm font-medium text-slate-200">Top 5 项目</h2>
            <ol className="mt-3 space-y-2">
              {report.topRepos.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-900/60 text-xs font-semibold text-sky-300">
                    {i + 1}
                  </span>
                  <a
                    href={r.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sky-400 hover:underline"
                  >
                    {r.full_name}
                  </a>
                  {r.language ? <Badge tone="default">{r.language}</Badge> : null}
                  <span className="ml-auto text-slate-400">★ {formatStars(r.stargazers_count)}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="mt-4">
            <h2 className="text-sm font-medium text-slate-200">本周新增仓库</h2>
            <ul className="mt-3 divide-y divide-slate-800">
              {report.newStars.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                  <a
                    href={r.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sky-400 hover:underline"
                  >
                    {r.full_name}
                  </a>
                  {r.language ? <Badge tone="muted">{r.language}</Badge> : null}
                  <span className="ml-auto text-slate-400">★ {formatStars(r.stargazers_count)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState title="还没有周报" description="点击上方按钮生成本周周报" />
        </div>
      )}
    </div>
  )
}
