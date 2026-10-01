import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { WeeklyReport } from '@shared/types'
import { unwrap, ipcErrorMessage, formatStars } from '../lib/api'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
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

/**
 * 首屏骨架。周报一进来就自动生成，AI 那一段要等 1~3 秒，这份占位负责把这段时间填满，
 * 免得用户先看到一个「还没有周报」的空白页、以为要自己点。
 * 结构刻意对着下面的真实排版（三张统计卡 + 一段正文 + 两张图表），切换时不跳版。
 */
function ReportSkeleton(): React.JSX.Element {
  return (
    <div className="mt-4 animate-pulse">
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex-1">
            <div className="h-8 w-16 rounded bg-surface-2" />
            <div className="mt-3 h-3 w-20 rounded bg-surface-2" />
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <div className="h-4 w-20 rounded bg-surface-2" />
        <div className="mt-3 h-3 w-full rounded bg-surface-2" />
        <div className="mt-2 h-3 w-4/5 rounded bg-surface-2" />
      </Card>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <div className="h-4 w-20 rounded bg-surface-2" />
            <div className="mt-3 h-[236px] rounded bg-surface-2" />
          </Card>
        ))}
      </div>
    </div>
  )
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

  // 用 useCallback 而不是普通函数：下面的自动生成 effect 依赖它，函数身份不稳的话
  // effect 每次渲染都会重跑一遍。
  const generate = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setReport(await unwrap(window.api.report.generate()))
    } catch (e) {
      setError(ipcErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * 进板块即自动生成，不需要用户点按钮。
   *
   * 两个前提都成立才敢这么写：
   * 1) 这个页面是 keep-alive 的（App.tsx 的 visited/mounted），**挂载后不再卸载**，
   *    所以这里的 effect 等于「首次进入该板块时跑一次」。切走再切回不会重新生成——
   *    重新生成要调一次 AI（要钱、要等），不该因为随手切个板块就发生。想刷新有右上角的
   *    「重新生成」。
   * 2) autoRan 这个守卫不是多余的：StrictMode 下 effect 会跑两次，不拦就是
   *    两次 IPC + 两次 AI 调用。同 App.tsx 里挡初始 load() 的 loadedOnce。
   */
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    void generate()
  }, [generate])

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">每周回顾</h1>
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
        ) : null}
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
      ) : error ? null : (
        // 自动生成中（或刚挂载、effect 还没跑）时的占位
        <ReportSkeleton />
      )}
    </div>
  )
}
