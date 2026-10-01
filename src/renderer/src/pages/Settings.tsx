import { useEffect, useState } from 'react'
import { unwrap, ipcErrorMessage } from '../lib/api'
import { useRepoStore } from '../store/repoStore'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { GithubLoginCard } from '../components/auth/GithubLoginCard'
import type { AiConfigView } from '@shared/types'

/** 来源徽章的文案与配色：界面存的 / .env 兜底的 / 没配 */
const SOURCE_LABEL: Record<AiConfigView['source'], string> = {
  store: '来自界面',
  env: '来自 .env',
  none: '未配置'
}

export function Settings(): React.JSX.Element {
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // —— AI 配置卡片 ——
  const [aiConfig, setAiConfig] = useState<AiConfigView | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [aiNotice, setAiNotice] = useState<string | null>(null)

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

  // 拉一次 AI 配置视图（**只有 hasKey / baseUrl / model / source，没有 apiKey**）。
  // 逻辑内联在 effect 里而不是抽成 loadAiConfig：抽出去会被 exhaustive-deps 判为缺依赖。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cfg = await unwrap(window.api.store.getAiConfig())
        if (cancelled) return
        setAiConfig(cfg)
        setAiBaseUrl(cfg.baseUrl)
        setAiModel(cfg.model)
      } catch {
        // unwrap 已经弹过 toast，这里不再重复
      }
    })()
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

  /** 登录 / 退出之后要让上面的 token 状态徽章跟着变 */
  async function refreshTokenStatus(): Promise<void> {
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

  /** 重新拉视图：保存 / 清除之后刷新来源与 hasKey 徽章 */
  async function reloadAiConfig(): Promise<void> {
    const cfg = await unwrap(window.api.store.getAiConfig())
    setAiConfig(cfg)
    setAiBaseUrl(cfg.baseUrl)
    setAiModel(cfg.model)
  }

  async function saveAi(): Promise<void> {
    setAiSaving(true)
    setAiNotice(null)
    try {
      // apiKey 留空表示「不修改现有 key」——契约里缺省即不动，清除走单独的按钮。
      // baseUrl / model 只在**用户改过**时才提交：否则会把从 .env 回落来的值固化进
      // store，之后改 .env 就不生效了（界面存的优先级更高）。传空串则表示清空要退回 .env。
      const key = apiKey.trim()
      const nextBase = aiBaseUrl.trim()
      const nextModel = aiModel.trim()
      const initialBase = aiConfig?.baseUrl ?? ''
      const initialModel = aiConfig?.model ?? ''
      await unwrap(
        window.api.store.saveAiConfig({
          apiKey: key ? key : undefined,
          baseUrl: nextBase === initialBase ? undefined : nextBase,
          model: nextModel === initialModel ? undefined : nextModel
        })
      )
      setApiKey('')
      await reloadAiConfig()
      setAiNotice('AI 配置已保存')
    } catch (e) {
      setAiNotice(ipcErrorMessage(e))
    } finally {
      setAiSaving(false)
    }
  }

  async function clearAiKey(): Promise<void> {
    setAiSaving(true)
    setAiNotice(null)
    try {
      await unwrap(window.api.store.clearAiKey())
      setApiKey('')
      await reloadAiConfig()
      setAiNotice('已清除界面保存的密钥（若 .env 里有 key 会回退到它）')
    } catch (e) {
      setAiNotice(ipcErrorMessage(e))
    } finally {
      setAiSaving(false)
    }
  }

  async function testAi(): Promise<void> {
    setAiTesting(true)
    setAiTestResult(null)
    try {
      // 探针不抛错：失败也以 { ok: false, message } 正常返回，直接把 message 渲染成一行
      const r = await unwrap(window.api.ai.testConnection())
      setAiTestResult({ ok: r.ok, message: r.message })
    } catch (e) {
      setAiTestResult({ ok: false, message: ipcErrorMessage(e) })
    } finally {
      setAiTesting(false)
    }
  }

  // —— baseUrl 软校验：只提示不拦截（国内中转地址五花八门）——
  const baseUrlTrimmed = aiBaseUrl.trim()
  const baseUrlMissingScheme =
    baseUrlTrimmed !== '' && !/^https?:\/\//i.test(baseUrlTrimmed)
  const baseUrlInsecure = /^http:\/\//i.test(baseUrlTrimmed)
  // 最常见的 404 成因：中转地址忘了 /v1 后缀
  const baseUrlMissingV1 =
    baseUrlTrimmed !== '' && !baseUrlMissingScheme && !/\/v1\/?$/i.test(baseUrlTrimmed)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">设置</h1>

      <GithubLoginCard onAuthChange={() => void refreshTokenStatus()} />

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
        <h2 className="text-sm font-medium text-slate-200">AI 配置（OpenAI 兼容端点）</h2>
        <p className="mt-1 text-xs text-slate-500">
          填在这里的配置优先级高于项目根目录{' '}
          <code className="rounded bg-slate-800 px-1">.env</code>，保存后立即生效，无需重启。
          API Key 同样经 safeStorage 加密存储、永不回显；留空保存表示不修改已有 Key。
        </p>

        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={aiConfig?.hasKey ? '已保存（留空则不修改）' : 'sk-...'}
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-sky-500"
            />
            <Button variant="ghost" onClick={() => setShowApiKey((v) => !v)}>
              {showApiKey ? '隐藏' : '显示'}
            </Button>
          </div>

          <div>
            <input
              type="text"
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              placeholder="Base URL（留空使用 .env / 官方默认）"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-sky-500"
            />
            {baseUrlMissingScheme ? (
              <p className="mt-1 text-xs text-red-400">
                Base URL 缺少 http(s):// 前缀，例如 https://api.openai.com/v1
              </p>
            ) : null}
            {baseUrlInsecure ? (
              <p className="mt-1 text-xs text-amber-400">
                这是 http:// 地址，API Key 会以明文传输，建议改用 https。
              </p>
            ) : null}
            {baseUrlMissingV1 ? (
              <p className="mt-1 flex items-center gap-2 text-xs text-amber-400">
                <span>地址不以 /v1 结尾，这是 404 最常见的原因。</span>
                <button
                  type="button"
                  onClick={() => setAiBaseUrl(`${baseUrlTrimmed.replace(/\/+$/, '')}/v1`)}
                  className="rounded border border-amber-700 px-1.5 py-0.5 text-amber-300 hover:bg-amber-900/40"
                >
                  补 /v1
                </button>
              </p>
            ) : null}
          </div>

          <input
            type="text"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            placeholder="模型名（留空使用 .env / 官方默认 gpt-4o-mini）"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-sky-500"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-slate-400">状态：</span>
          {aiConfig === null ? (
            <Badge tone="muted">未知</Badge>
          ) : aiConfig.hasKey ? (
            <Badge tone="success">已配置</Badge>
          ) : (
            <Badge tone="muted">未配置</Badge>
          )}
          {aiConfig ? (
            <Badge tone={aiConfig.source === 'store' ? 'success' : aiConfig.source === 'env' ? 'default' : 'muted'}>
              {SOURCE_LABEL[aiConfig.source]}
            </Badge>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void saveAi()} loading={aiSaving}>
            保存 AI 配置
          </Button>
          <Button onClick={() => void clearAiKey()} loading={aiSaving} disabled={!aiConfig?.hasKey}>
            清除密钥
          </Button>
          <Button onClick={() => void testAi()} loading={aiTesting}>
            测试 AI 连接
          </Button>
        </div>
        {aiNotice ? <p className="mt-3 text-sm text-slate-400">{aiNotice}</p> : null}
        {aiTestResult ? (
          <p
            className={`mt-1 text-sm ${aiTestResult.ok ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {aiTestResult.message}
          </p>
        ) : null}
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
            测试 GitHub 连接
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
