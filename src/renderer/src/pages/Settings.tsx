import { useEffect, useMemo, useState } from 'react'
import { unwrap, ipcErrorMessage } from '../lib/api'
import { cn } from '../lib/cn'
import { useRepoStore } from '../store/repoStore'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Badge } from '../components/common/Badge'
import { Input } from '../components/common/Input'
import { GithubLoginCard } from '../components/auth/GithubLoginCard'
import { ThemeCard } from '../components/settings/ThemeCard'
import { AiKeyGuide } from '../components/settings/AiKeyGuide'
import { AiProviderPicker } from '../components/settings/AiProviderPicker'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'
import { checkBaseUrl, isLocalEndpoint, matchPreset } from '@shared/ai-providers'
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
  /** null + tokenChecked === false = 还没读完；null + true = 这一次没读到（不是"没配置"） */
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // —— AI 配置卡片 ——
  const [aiConfig, setAiConfig] = useState<AiConfigView | null>(null)
  /** null + aiConfigChecked === false = 还没读完；null + true = 这一次没读到（不是"没配置"） */
  const [aiConfigChecked, setAiConfigChecked] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [aiNotice, setAiNotice] = useState<string | null>(null)
  /** 刚保存成功：在提示行后面挂一个「立即测试连接」的 CTA */
  const [aiJustSaved, setAiJustSaved] = useState(false)
  /** 提示行是不是一条「拦下来了」的报错（决定用红色还是灰色渲染） */
  const [aiNoticeError, setAiNoticeError] = useState(false)

  const loading = useRepoStore((s) => s.loading)
  const enriching = useRepoStore((s) => s.enriching)
  const refreshFromGitHub = useRepoStore((s) => s.refreshFromGitHub)
  const enrich = useRepoStore((s) => s.enrich)
  const saveToken = useRepoStore((s) => s.saveToken)

  // 状态徽章的取值只有一处：它**不会抛错**（hasToken 内部把失败收成 null），
  // 所以这里不需要 try/catch，只需要记得把"读完了"也标上。
  async function refreshTokenStatus(): Promise<void> {
    setHasToken(await useRepoStore.getState().hasToken())
    setTokenChecked(true)
  }

  useEffect(() => {
    let cancelled = false
    void useRepoStore
      .getState()
      .hasToken()
      .then((v) => {
        if (cancelled) return
        setHasToken(v)
        setTokenChecked(true)
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
        // unwrap 已经弹过 toast，这里不再重复；但要标记"读过了"，否则徽章会一直停在「未知」，
        // 而「未知」和「读不到」对用户的含义不同（前者是还没读，后者是需要重试）。
      } finally {
        if (!cancelled) setAiConfigChecked(true)
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
    await refreshTokenStatus()
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

  /**
   * 重新拉视图：保存 / 清除之后刷新来源与 hasKey 徽章，也供卡片上的「重试」用。
   *
   * **不抛错**，返回值表示"这一次读到了没有"。两个理由：
   *   ① 保存/清除的成功与"随后读一次状态"的成败是两件事——保存明明成功了，
   *      却因为这一次读失败而把整个操作显示成失败，是在说反话；
   *   ② 卡片上的「重试」按钮是 onClick 直接调的，抛出去就是一个没人接的
   *      unhandled rejection（unwrap 已经弹过 toast）。
   */
  async function reloadAiConfig(): Promise<boolean> {
    try {
      const cfg = await unwrap(window.api.store.getAiConfig())
      setAiConfig(cfg)
      setAiBaseUrl(cfg.baseUrl)
      setAiModel(cfg.model)
      setAiConfigChecked(true)
      return true
    } catch {
      // 读不到：aiConfig 保持 null（徽章据此显示「读不到」+ 重试），只是把"读过了"标上
      setAiConfigChecked(true)
      return false
    }
  }

  async function saveAi(): Promise<void> {
    const key = apiKey.trim()
    const nextBase = aiBaseUrl.trim()
    const nextModel = aiModel.trim()
    const initialBase = aiConfig?.baseUrl ?? ''
    const initialModel = aiConfig?.model ?? ''

    // 界面先拦一道：自定义端点必须给模型名。主进程的 resolveModel() 也会拒（那里是权威），
    // 这里拦是为了不用白等一次 IPC，而且文案能就近显示在按钮旁边。
    if (nextBase !== '' && nextModel === '') {
      setAiJustSaved(false)
      setAiNoticeError(true)
      setAiNotice(
        '已填自定义 Base URL 但模型名留空：请填写该服务商支持的模型名（如 deepseek-chat、glm-4-plus）。'
      )
      return
    }

    setAiSaving(true)
    setAiNotice(null)
    setAiNoticeError(false)
    setAiJustSaved(false)
    // 只有「确实改动了连接信息」这一次自动跑探针。判据放在 unwrap 成功之后，
    // 避免保存失败也去连一次。
    let autoTest = false
    try {
      // apiKey 留空表示「不修改现有 key」——契约里缺省即不动，清除走单独的按钮。
      // baseUrl / model 同理只在**用户改过**时才提交：否则会把从 .env 回落来的值固化进
      // store，之后改 .env 就不生效了（界面存的优先级更高）。传空串则表示清空、退回 .env。
      await unwrap(
        window.api.store.saveAiConfig({
          apiKey: key ? key : undefined,
          baseUrl: nextBase === initialBase ? undefined : nextBase,
          model: nextModel === initialModel ? undefined : nextModel
        })
      )
      autoTest = key !== '' || nextBase !== initialBase || nextModel !== initialModel
      setApiKey('')
      // 「保存成功」与「随后把状态读回来」分开说：读失败不该把保存说成失败
      const reread = await reloadAiConfig()
      setAiNotice(reread ? 'AI 配置已保存' : 'AI 配置已保存，但状态这一次没读回来，点「重试」再读一次。')
      setAiJustSaved(true)
    } catch (e) {
      setAiNoticeError(true)
      setAiNotice(ipcErrorMessage(e))
    } finally {
      setAiSaving(false)
    }
    // 改动连接信息的那一刻验一次是有价值的（用户此刻就在等结果）；没改动时本来也没东西可测。
    // 仍然不做「每次点保存都测」——那会在用户只是想改个模型名时也多发一次请求。
    if (autoTest) await testAi()
  }

  async function clearAiKey(): Promise<void> {
    setAiSaving(true)
    setAiNotice(null)
    setAiNoticeError(false)
    setAiJustSaved(false)
    try {
      await unwrap(window.api.store.clearAiKey())
      setApiKey('')
      const reread = await reloadAiConfig()
      setAiNotice(
        reread
          ? '已清除界面保存的密钥（若 .env 里有 key 会回退到它）'
          : '已清除界面保存的密钥，但状态这一次没读回来，点「重试」再读一次。'
      )
    } catch (e) {
      setAiNoticeError(true)
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

  // —— Base URL 软校验：只提示不拦截（国内中转地址五花八门）——
  // 规则都在 shared/ai-providers.ts 里，是纯函数，可被自检脚本断言；
  // 这里只负责渲染。用 useMemo 是因为它在 render 里要遍历一遍问题列表。
  const baseUrlIssues = useMemo(() => checkBaseUrl(aiBaseUrl), [aiBaseUrl])
  const activePreset = matchPreset(aiBaseUrl)
  /** 正在编辑的地址是不是本地端点（决定 Key 要不要必填、以及选中的预设说明） */
  const editingLocalEndpoint = isLocalEndpoint(aiBaseUrl)
  const modelPlaceholder = activePreset?.model
    ? `模型名（例：${activePreset.model}）`
    : aiBaseUrl.trim() === ''
      ? '模型名（留空则用 gpt-4o-mini）'
      : '模型名（自定义端点必填）'

  return (
    <PageContainer width="narrow">
      <PageHeader tab="settings" title="设置" />

      <GithubLoginCard onAuthChange={() => void refreshTokenStatus()} />

      <ThemeCard />

      <Card>
        <h2 className="text-sm font-medium text-fg">GitHub Token</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Token 需要 <code className="rounded bg-surface-2 px-1">public_repo</code> scope；
          主进程用 safeStorage 加密后存在 userData 目录，不会明文落盘。
        </p>
        <p className="mt-1 text-xs text-danger">
          注意：unstar 是破坏性操作，会真正取消你 GitHub 上的 Star。
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            size="md"
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_..."
            className="min-w-0 flex-1"
          />
          <Button variant="ghost" onClick={() => setShowToken((v) => !v)}>
            {showToken ? '隐藏' : '显示'}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!token.trim()}>
            保存 Token
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-fg-muted">状态：</span>
          {/* 三态而不是两态：'未配置' 是一个结论，只有在**确实读到了空**时才能下。
              读取失败（库文件坏了 / 主进程没起来）走中间的「读不到」，否则用户会去
              重填一遍其实已经存好的 token，而真正的问题一直没被说出来。 */}
          {!tokenChecked ? (
            <Badge tone="muted">未知</Badge>
          ) : hasToken === null ? (
            <Badge tone="warning">读不到</Badge>
          ) : hasToken ? (
            <Badge tone="success">已配置</Badge>
          ) : (
            <Badge tone="muted">未配置</Badge>
          )}
        </div>
        {tokenChecked && hasToken === null ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-xs text-fg-subtle">
              本地数据这一次没读到，<span className="text-fg">不代表你没配过</span>
              ——Token 可能好好地存着。
            </p>
            {/* 得给一个重试入口：设置页是保活的（切换页面不卸载），不给的话
                这个徽章会一直停在「读不到」，唯一出路是重启应用。 */}
            <Button size="sm" variant="ghost" onClick={() => void refreshTokenStatus()}>
              重试
            </Button>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-fg">AI 配置</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          支持任何 OpenAI 格式的端点（DeepSeek、智谱、通义、Kimi、中转，以及本地
          Ollama / LM Studio），只要 <span className="text-fg">Base URL + 模型名 + Key</span>{' '}
          三项对上即可。在这里填一次就行，不用去改项目根目录的{' '}
          <code className="rounded bg-surface-2 px-1">.env</code>
          。保存后立即生效、无需重启；API Key 经 safeStorage 加密后存在 userData 目录，
          永不回显，留空保存表示不修改已有 Key。
        </p>

        <div className="mt-3">
          <div className="mb-1.5 text-xs text-fg-muted">选一个服务商快速填好地址和模型：</div>
          <AiProviderPicker
            baseUrl={aiBaseUrl}
            onPick={(preset) => {
              setAiBaseUrl(preset.baseUrl)
              setAiModel(preset.model)
            }}
          />
        </div>

        <AiKeyGuide baseUrl={aiBaseUrl} />

        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              size="md"
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                aiConfig?.hasKey
                  ? '已保存（留空则不修改）'
                  : editingLocalEndpoint
                    ? '本地端点通常不需要 Key'
                    : 'sk-...'
              }
              className="min-w-0 flex-1"
            />
            <Button variant="ghost" onClick={() => setShowApiKey((v) => !v)}>
              {showApiKey ? '隐藏' : '显示'}
            </Button>
          </div>

          <div>
            <Input
              size="md"
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              placeholder="Base URL（留空使用官方端点）"
              className="w-full"
            />
            {baseUrlIssues.map((issue) => {
              const fix = issue.suggestV1
              return (
                <p
                  key={issue.message}
                  className={cn(
                    'mt-1 flex flex-wrap items-center gap-2 text-xs',
                    issue.level === 'danger' ? 'text-danger' : 'text-warning'
                  )}
                >
                  <span>{issue.message}</span>
                  {fix ? (
                    <button
                      type="button"
                      onClick={() => setAiBaseUrl(fix)}
                      className="shrink-0 rounded border border-warning/40 px-1.5 py-0.5 text-warning hover:bg-warning/15"
                    >
                      补 /v1
                    </button>
                  ) : null}
                </p>
              )
            })}
          </div>

          <Input
            size="md"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            placeholder={modelPlaceholder}
            className="w-full"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-fg-muted">状态：</span>
          {/* 与上面 Token 徽章同一套三态：'未配置' 是一个结论，只有在**确实读到了空**
              时才能下。读不到（库文件坏了 / 主进程没起来）显示「读不到」，否则用户会
              去重填一遍其实已经存好的 Key，而真正的问题一直没被说出来。 */}
          {!aiConfigChecked ? (
            <Badge tone="muted">未知</Badge>
          ) : aiConfig === null ? (
            <Badge tone="warning">读不到</Badge>
          ) : aiConfig.hasKey ? (
            <Badge tone="success">已配置</Badge>
          ) : isLocalEndpoint(aiConfig.baseUrl) ? (
            // 本地端点没有 Key 这个概念，显示「未配置」会让人以为还得去填一个
            <Badge tone="success">本地端点（无需 Key）</Badge>
          ) : (
            <Badge tone="muted">未配置</Badge>
          )}
          {aiConfig ? (
            <Badge tone={aiConfig.source === 'store' ? 'success' : aiConfig.source === 'env' ? 'default' : 'muted'}>
              {SOURCE_LABEL[aiConfig.source]}
            </Badge>
          ) : null}
        </div>

        {aiConfigChecked && aiConfig === null ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-xs text-fg-subtle">
              这一次没读到你的 AI 配置，<span className="text-fg">不代表你没配过</span>
              ——Key 可能好好地存着。
            </p>
            {/* 设置页是保活的（切换页面不卸载），没有这个按钮徽章会一直停在「读不到」，
                唯一出路是重启应用。与 Token 那个「重试」各管各的：两者的读取路径不同，
                失败原因也可能只影响其中一个。 */}
            <Button size="sm" variant="ghost" onClick={() => void reloadAiConfig()}>
              重试
            </Button>
          </div>
        ) : null}

        {/* 最容易让人困惑的一种状态：界面显示"已配置"，但 Key 其实来自 .env，
            在这里填会被界面值覆盖、且清除界面密钥后又会回落回去。 */}
        {aiConfig?.source === 'env' ? (
          <p className="mt-2 text-xs text-warning">
            当前用的是 <code className="rounded bg-surface-2 px-1">.env</code> 里的 Key。
            在上方填写并保存会覆盖它（界面值优先）；点「清除密钥」可退回 .env。
          </p>
        ) : null}

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
        {aiNotice ? (
          <p
            className={cn(
              'mt-3 flex flex-wrap items-center gap-2 text-sm',
              aiNoticeError ? 'text-danger' : 'text-fg-muted'
            )}
          >
            <span>{aiNotice}</span>
            {/* 保存成功但没自动测（已有 Key 的情况）时给一个就近的入口，
                省得用户再去下面那排按钮里找 */}
            {aiJustSaved ? (
              <Button size="sm" variant="ghost" onClick={() => void testAi()}>
                立即测试连接
              </Button>
            ) : null}
          </p>
        ) : null}
        {aiTestResult ? (
          <p className={cn('mt-1 text-sm', aiTestResult.ok ? 'text-success' : 'text-danger')}>
            {aiTestResult.message}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-fg">数据与 AI</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          同步会保留已 Fork / 已 clone / 已分类的标记；AI 补全只填空缺的摘要与分类。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* ⚠️ 这两个必须互斥。enrich() 在**发请求那一刻**取 get().repos 当输入，
              而同步会把它整份换掉；两边能同时跑的话，先完成的同步结果会被
              后完成的补全用旧列表覆盖——用户看到「已同步 N 个」的提示，
              列表里却少了刚同步回来的仓库，而且主进程也把这份旧列表落了盘。
              Manage.tsx 的 headerBusy 早就这么做了，这里原来是漏的。 */}
          <Button
            variant="primary"
            onClick={() => void refreshFromGitHub()}
            loading={loading}
            disabled={loading || enriching}
          >
            从 GitHub 同步
          </Button>
          <Button
            onClick={() => void enrich()}
            loading={enriching}
            disabled={loading || enriching}
          >
            AI 补全分类
          </Button>
          <Button onClick={() => void test()} loading={testing}>
            测试 GitHub 连接
          </Button>
        </div>
        {testResult ? (
          <p className={cn('mt-3 text-sm', testResult.ok ? 'text-success' : 'text-danger')}>
            {testResult.message}
          </p>
        ) : null}
      </Card>

      <p className="text-xs text-fg-subtle">
        当前运行模式由项目根目录{' '}
        <code className="rounded bg-surface-2 px-1">.env</code> 的 MOCK_MODE 控制。
      </p>
    </PageContainer>
  )
}
