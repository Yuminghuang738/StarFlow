import { useEffect, useState } from 'react'
import { unwrap, ipcErrorMessage } from '../lib/api'
import { useRepoStore } from '../store/repoStore'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'

export function Settings(): React.JSX.Element {
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const loading = useRepoStore((s) => s.loading)
  const enriching = useRepoStore((s) => s.enriching)
  const refreshFromGitHub = useRepoStore((s) => s.refreshFromGitHub)
  const enrich = useRepoStore((s) => s.enrich)
  const saveToken = useRepoStore((s) => s.saveToken)

  useEffect(() => {
    let cancelled = false
    useRepoStore
      .getState()
      .hasToken()
      .then((v) => {
        if (!cancelled) setHasToken(v)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(): Promise<void> {
    const trimmed = token.trim()
    if (!trimmed) return
    await saveToken(trimmed)
    setToken('')
    setHasToken(await useRepoStore.getState().hasToken())
  }

  async function test(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    try {
      const repos = await unwrap(window.api.github.fetchStarred())
      setTestResult({ ok: true, message: `连接正常，共 ${repos.length} 个 Star` })
    } catch (e) {
      setTestResult({ ok: false, message: ipcErrorMessage(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">设置</h1>

      <Card className="mt-4">
        <h2 className="text-sm font-medium text-slate-200">GitHub Token</h2>
        <p className="mt-1 text-xs text-slate-500">
          Token 需要 <code className="rounded bg-slate-800 px-1">public_repo</code> scope；
          主进程用 safeStorage 加密后存在 userData 目录，不会明文落盘。
        </p>
        <p className="mt-1 text-xs text-red-400">
          注意：unstar 是破坏性操作，会真正取消你 GitHub 上的 Star。
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_..."
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-sky-500"
          />
          <Button variant="ghost" onClick={() => setShowToken((v) => !v)}>
            {showToken ? '隐藏' : '显示'}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!token.trim()}>
            保存 Token
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-slate-400">状态：</span>
          {hasToken === null ? (
            <Badge tone="muted">未知</Badge>
          ) : hasToken ? (
            <Badge tone="success">已配置</Badge>
          ) : (
            <Badge tone="muted">未配置</Badge>
          )}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-medium text-slate-200">数据与 AI</h2>
        <p className="mt-1 text-xs text-slate-500">
          同步会保留已 Fork / 已 clone / 已分类的标记；AI 补全只填空缺的摘要与分类。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void refreshFromGitHub()} loading={loading}>
            从 GitHub 同步
          </Button>
          <Button onClick={() => void enrich()} loading={enriching}>
            AI 补全分类
          </Button>
          <Button onClick={() => void test()} loading={testing}>
            测试连接
          </Button>
        </div>
        {testResult ? (
          <p className={`mt-3 text-sm ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult.message}
          </p>
        ) : null}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        当前运行模式由项目根目录{' '}
        <code className="rounded bg-slate-800 px-1">.env</code> 的 MOCK_MODE 控制。
      </p>
    </div>
  )
}
