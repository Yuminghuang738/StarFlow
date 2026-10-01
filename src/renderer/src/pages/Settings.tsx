import { useCallback, useEffect, useState } from 'react'
import { unwrap } from '../lib/api'
import { useRepoStore } from '../store/repoStore'
import { pushToast } from '../components/common/Toast'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'

export function Settings(): React.JSX.Element {
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const loading = useRepoStore((s) => s.loading)
  const refreshFromGitHub = useRepoStore((s) => s.refreshFromGitHub)
  const enrich = useRepoStore((s) => s.enrich)

  const checkToken = useCallback(async () => {
    try {
      setHasToken(await unwrap(window.api.store.hasToken()))
    } catch {
      // unwrap 已经弹过 toast
    }
  }, [])

  useEffect(() => {
    void checkToken()
  }, [checkToken])

  async function save(): Promise<void> {
    const trimmed = token.trim()
    if (!trimmed) {
      pushToast({ type: 'error', message: 'Token 不能为空' })
      return
    }
    setBusy(true)
    try {
      await unwrap(window.api.store.saveToken(trimmed))
      // 存完立刻清空输入框，不要把 token 留在界面上
      setToken('')
      await checkToken()
      pushToast({ type: 'success', message: 'Token 已保存' })
    } catch {
      // unwrap 已经弹过 toast
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">设置</h1>

      <Card className="mt-4">
        <h2 className="text-sm font-medium text-slate-200">GitHub Token</h2>
        <p className="mt-1 text-xs text-slate-500">
          主进程用 safeStorage 加密后存在 userData 目录，不会明文落盘（无加密后端时会降级并告警）。
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_..."
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-sky-500"
          />
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            保存
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={() => void checkToken()}>
            检查状态
          </Button>
          <span className="text-sm">
            {hasToken === null ? (
              <span className="text-slate-500">未知</span>
            ) : hasToken ? (
              <span className="text-emerald-400">已配置 Token</span>
            ) : (
              <span className="text-amber-400">未配置 Token</span>
            )}
          </span>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-medium text-slate-200">数据</h2>
        <p className="mt-1 text-xs text-slate-500">
          同步会重新拉取 Star 列表并覆盖本地库；AI 补全只填空缺的摘要与分类。
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            onClick={() => void refreshFromGitHub()}
            disabled={loading}
          >
            从 GitHub 同步
          </Button>
          <Button onClick={() => void enrich()} disabled={loading}>
            AI 补全分类
          </Button>
        </div>
      </Card>
    </div>
  )
}
