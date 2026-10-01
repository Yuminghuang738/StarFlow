import { matchPreset } from '@shared/ai-providers'

/**
 * AI Key 引导（三步）。
 *
 * 用原生 `<details>` 而不是自绘折叠：不需要 state、自带键盘/无障碍语义，
 * 而且默认收起——已经配好 Key 的人不该被这段话反复占版面。
 *
 * ⚠️ 这里**只讲怎么填，不回显任何 Key**。AiConfigView 刻意没有 apiKey 字段，
 * 引导块也不该成为绕开它的口子（连 placeholder 都只写 "sk-..." 这种形态示意）。
 *
 * `baseUrl` 用来把第 1 步的「去哪拿 Key」链接**跟着当前端点走**：选了 DeepSeek 就指向
 * DeepSeek 控制台。由 URL 推导（matchPreset）而不是另存一个 id，这样用户手打地址也认。
 */
export function AiKeyGuide({ baseUrl }: { baseUrl: string }): React.JSX.Element {
  const preset = matchPreset(baseUrl)

  return (
    <details className="mt-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
      <summary className="cursor-pointer select-none text-xs font-medium text-fg-muted transition-colors hover:text-fg">
        还没有 API Key？三步搞定
      </summary>

      <ol className="mt-2 space-y-3 text-xs leading-relaxed text-fg-muted">
        <li>
          <div className="font-medium text-fg">1. 先拿到一个 Key</div>
          <div className="mt-0.5">
            <span className="text-fg">任何 OpenAI 格式的端点都可以用</span>
            ，不限于 OpenAI 官方。上面那排按钮就是常用的几家，点一下会自动填好地址和模型；
            也可以直接用你手上的中转。用哪家，就去哪家的控制台建 Key：
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {/* OpenAI 那条固定列在下面，选中官方预设时这里就不要再重复一遍同一个链接 */}
            {preset?.keyUrl && preset.id !== 'openai' ? (
              <li>
                当前选择的 <span className="text-fg">{preset.label}</span>：
                <a
                  href={preset.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link hover:underline"
                >
                  {preset.keyUrl.replace(/^https?:\/\//, '')}
                </a>
              </li>
            ) : null}
            <li>
              OpenAI 官方：
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="text-link hover:underline"
              >
                platform.openai.com/api-keys
              </a>
            </li>
            <li>
              第三方中转：向服务商要 <span className="text-fg">Key</span> 和{' '}
              <span className="text-fg">Base URL</span> 两样东西。
            </li>
            <li>本地跑 Ollama / LM Studio：不需要 Key，地址填本机端口即可。</li>
          </ul>
        </li>

        <li>
          <div className="font-medium text-fg">2. 回到这个页面填进去</div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            <li>
              <span className="text-fg">API Key</span>：保存后不回显；再次保存时留空 =
              不改动。想换 Key 就直接覆盖成新的。本地端点可以留空。
            </li>
            <li>
              <span className="text-fg">Base URL</span>：留空表示用 OpenAI 官方端点。多数服务商形如{' '}
              <code className="rounded bg-surface-2 px-1">https://xxx/v1</code>，但也有例外——
              智谱是 <code className="rounded bg-surface-2 px-1">/api/paas/v4</code>，
              一律以服务商文档给的地址为准。
            </li>
            <li>
              <span className="text-fg">模型名</span>：<span className="text-fg">填了自定义地址就必须填</span>
              （各家模型名不一样，没有通用默认值）。点上面的预设会自动带上一个，可以直接改。
            </li>
          </ul>
        </li>

        <li>
          <div className="font-medium text-fg">3. 点下面的「测试 AI 连接」</div>
          <div className="mt-0.5">
            改动地址或模型后保存时，会自动帮你测一次。常见的报错对照：
          </div>
          <ul className="mt-1 space-y-0.5">
            <li>
              <code className="rounded bg-surface-2 px-1">401</code> —— Key 不对、已撤销，
              或者复制时带了空格 / 引号。
            </li>
            <li>
              <code className="rounded bg-surface-2 px-1">404</code> —— Base URL 不完整，
              或者模型名在该服务商处不存在（模型名迭代很快，以服务商文档为准）。
            </li>
            <li>
              <code className="rounded bg-surface-2 px-1">429</code> —— 额度用尽或触发频率限制。
            </li>
            <li>连接超时 / 连不上 —— 网络到不了该地址；本地端点则先确认服务已经启动。</li>
          </ul>
        </li>
      </ol>
    </details>
  )
}
