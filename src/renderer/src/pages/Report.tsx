import { useState } from 'react'
import type { WeeklyReport } from '@shared/types'
import { unwrap } from '../lib/api'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'

function BigStat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <Card className="flex-1">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{label}</div>
    </Card>
  )
}

// 极简占位版：P6 会整体重写（图表见 backlog，本轮不画 ECharts）
export function Report(): React.JSX.Element {
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function generate(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setReport(await unwrap(window.api.report.generate()))
    } catch (e) {
      // unwrap 已经弹过 toast，这里再把错误留在页面上，方便截图排查
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">周报</h1>
        <Button variant="primary" onClick={() => void generate()} disabled={loading}>
          {loading ? '生成中…' : '生成本周周报'}
        </Button>
      </header>

      {error ? (
        <Card className="mt-4 border-red-900 bg-red-950/40 text-sm text-red-300">
          生成失败：{error}
        </Card>
      ) : null}

      {report ? (
        <>
          <div className="mt-4 flex gap-3">
            <BigStat label="本周新增 Star" value={report.newStars.length} />
            <BigStat label="语言分布种类" value={Object.keys(report.languageStats).length} />
            <BigStat label="仓库总数" value={Object.values(report.languageStats).reduce((a, b) => a + b, 0)} />
          </div>

          <Card className="mt-4">
            <div className="text-sm text-slate-400">
              区间 {report.weekStart.slice(0, 10)} ~ {report.weekEnd.slice(0, 10)}
            </div>
            <p className="mt-2 text-sm text-slate-200">{report.aiSummary}</p>
          </Card>

          <Card className="mt-4">
            <pre className="overflow-x-auto text-xs text-slate-300">
              {JSON.stringify(report, null, 2)}
            </pre>
          </Card>
        </>
      ) : (
        <Card className="mt-4 text-center text-sm text-slate-400">
          点右上角按钮生成本周周报
        </Card>
      )}
    </div>
  )
}
