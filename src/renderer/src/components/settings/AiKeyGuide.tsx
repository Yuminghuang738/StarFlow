/**
 * AI Key 引导（三步）。
 *
 * 用原生 `<details>` 而不是自绘折叠：不需要 state、自带键盘/无障碍语义，
 * 而且默认收起——已经配好 Key 的人不该被这段话反复占版面。
 *
 * ⚠️ 这里**只讲怎么填，不回显任何 Key**。AiConfigView 刻意没有 apiKey 字段，
 * 引导块也不该成为绕开它的口子（连 placeholder 都只写 "sk-..." 这种形态示意）。
 */
export function AiKeyGuide(): React.JSX.Element {
  return (
    <details className="mt-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
      <summary className="cursor-pointer select-none text-xs font-medium text-fg-muted transition-colors hover:text-fg">
        还没有 API Key？三步搞定
      </summary>

      <ol className="mt-2 space-y-3 text-xs leading-relaxed text-fg-muted">
        <li>
          <div className="font-medium text-fg">1. 先拿到一个 Key</div>
          <div className="mt-0.5">
            用官方端点就去{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-link hover:underline"
            >
              platform.openai.com/api-keys
            </a>{' '}
            新建一个；用第三方中转的话，向服务商要 <span className="text-fg">Key</span> 和{' '}
            <span className="text-fg">Base URL</span> 两样东西。
          </div>
        </li>

        <li>
          <div className="font-medium text-fg">2. 回到这个页面填进去</div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            <li>
              <span className="text-fg">API Key</span>：必填，保存后不回显；再次保存时留空 =
              不改动。想换 Key 就直接覆盖成新的。
            </li>
            <li>
              <span className="text-fg">Base URL</span>：只有用中转才需要填，官方端点留空即可。
              一般是 <code className="rounded bg-surface-2 px-1">https://xxx/v1</code> 这种带 /v1
              的形式。
            </li>
            <li>
              <span className="text-fg">模型名</span>：留空会用 .env 或官方默认
              （gpt-4o-mini）；中转支持的模型名以服务商文档为准。
            </li>
          </ul>
        </li>

        <li>
          <div className="font-medium text-fg">3. 点下面的「测试 AI 连接」</div>
          <div className="mt-0.5">
            首次填入 Key 并保存时，会自动帮你测一次。常见的报错对照：
          </div>
          <ul className="mt-1 space-y-0.5">
            <li>
              <code className="rounded bg-surface-2 px-1">401</code> —— Key 不对、已撤销，
              或者复制时带了空格 / 引号。
            </li>
            <li>
              <code className="rounded bg-surface-2 px-1">404</code> —— Base URL 少了{' '}
              <code className="rounded bg-surface-2 px-1">/v1</code>，或者模型名写错了。
            </li>
            <li>
              <code className="rounded bg-surface-2 px-1">429</code> —— 额度用尽或触发频率限制。
            </li>
            <li>连接超时 —— 网络到不了该地址（需要代理的话，本应用不会自动走系统代理）。</li>
          </ul>
        </li>
      </ol>
    </details>
  )
}
