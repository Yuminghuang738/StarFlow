import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { WeeklyReport } from '@shared/types'
import { unwrap, ipcErrorMessage, formatStars } from '../lib/api'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { EmptyState } from '../components/common/EmptyState'
import { useChartTheme } from '../components/charts/chartTheme'
import { weeklyLanguageOption, weeklyTrendBarOption } from '../components/charts/options'

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
  lines.push('# StarFlow 周报')
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
  a.download = `starflow-weekly-${report.weekStart.slice(0, 10)}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function Report(): React.JSX.Element {
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const palette = useChartTheme()

  const langOption = useMemo(() => {
    if (!report) return null
    return weeklyLanguageOption(
      Object.entries(report.languageStats).map(([name, value]) => ({ name, value })),
      palette
    )
  }, [report, palette])

  const trendOption = useMemo(() => {
    if (!report) return null
    const keys = Object.keys(report.dailyStarCount).sort()
    return weeklyTrendBarOption(
      keys,
      keys.map((k) => report.dailyStarCount[k]),
      palette
    )
  }, [report, palette])

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
            <p className="mt-1 text-sm text-fg-muted">
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
        <Card className="mt-4 border-danger/30 bg-danger/10 text-sm text-danger">
          <p className="mb-3">生成失败：{error}</p>
          <Button onClick={() => void generate()}>重试</Button>
        </Card>
      ) : null}

      {report ? (
        <>
          <div className="mt-4 flex gap-3">
            <Card className="flex-1">
              <div className="text-3xl font-semibold tabular-nums text-primary">
                {report.newStars.length}
              </div>
              <div className="mt-1 text-sm text-fg-muted">本周新增 Star</div>
            </Card>
            <Card className="flex-1">
              <div className="text-3xl font-semibold tabular-nums">
                {Object.keys(report.languageStats).length}
              </div>
              <div className="mt-1 text-sm text-fg-muted">语言分布种类</div>
            </Card>
            <Card className="flex-1">
              <div className="text-3xl font-semibold tabular-nums">{report.topRepos.length}</div>
              <div className="mt-1 text-sm text-fg-muted">Top 项目</div>
            </Card>
          </div>

          <Card className="mt-4">
            <h2 className="text-sm font-medium text-fg">AI 总结</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-fg-muted">
              {report.aiSummary}
            </p>
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <h2 className="text-sm font-medium text-fg">语言分布</h2>
              <ReactECharts option={langOption} style={{ height: 260 }} />
            </Card>
            <Card>
              <h2 className="text-sm font-medium text-fg">本周新增趋势</h2>
              <ReactECharts option={trendOption} style={{ height: 260 }} />
            </Card>
          </div>

          <Card className="mt-4">
            <h2 className="text-sm font-medium text-fg">Top 5 项目</h2>
            <ol className="mt-3 space-y-2">
              {report.topRepos.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <a
                    href={r.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-link hover:underline"
                  >
                    {r.full_name}
                  </a>
                  {r.language ? <Badge tone="default">{r.language}</Badge> : null}
                  <span className="ml-auto text-fg-muted">★ {formatStars(r.stargazers_count)}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="mt-4">
            <h2 className="text-sm font-medium text-fg">本周新增仓库</h2>
            <ul className="mt-3 divide-y divide-border">
              {report.newStars.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                  <a
                    href={r.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-link hover:underline"
                  >
                    {r.full_name}
                  </a>
                  {r.language ? <Badge tone="muted">{r.language}</Badge> : null}
                  <span className="ml-auto text-fg-muted">★ {formatStars(r.stargazers_count)}</span>
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
