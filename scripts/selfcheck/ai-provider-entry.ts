// AI 端点通用化自检：不依赖 GUI、不发任何真实请求，验「任何 OpenAI 格式端点都能用」这条链路。
//
// 跑法：node scripts/selfcheck/ai-provider.mjs
//
// ⚠️ MOCK_MODE 必须是 false——本自检要验的正是真实分支（resolveModel 的模型名裁决、
//    client 的缓存键），mock 分支会在这些逻辑之前就返回。安全性靠 globalThis.fetch 打桩
//    保证：所有出网调用都被截下来记录，一条都不会真的发出去，最后还会断言调用次数。
//
// 覆盖：
//   1) isLocalEndpoint / matchPreset / checkBaseUrl 三个纯函数（含智谱 /v4 这类反例）
//   2) AI_PRESETS 表自身的健全性
//   3) resolveModel：自定义 Base URL + 空模型名 → 配置错误，且**不发请求**
//   4) client 缓存键带上 baseUrl（回归：只换地址不换 Key 必须真的打到新地址）
//   5) 本地端点免 Key
import * as ai from '../../src/main/ai'
import * as config from '../../src/main/config'
import { AI_PRESETS, isLocalEndpoint, matchPreset, checkBaseUrl } from '@shared/ai-providers'
import type { Repo } from '@shared/types'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

/* ------------------------------------------------------------------ */
/* fetch 打桩：记录每次请求的 URL 与 body.model，并回一个合法响应        */
/* ------------------------------------------------------------------ */

interface Call {
  url: string
  model: string
}
const calls: Call[] = []

function installFetchStub(): () => void {
  const orig = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let model = ''
    if (typeof init?.body === 'string') {
      try {
        const parsed = JSON.parse(init.body) as { model?: unknown }
        model = typeof parsed.model === 'string' ? parsed.model : ''
      } catch {
        model = '(解析失败)'
      }
    }
    calls.push({ url, model })

    const body = {
      id: 'chatcmpl-stub',
      object: 'chat.completion',
      created: 0,
      model,
      choices: [
        { index: 0, message: { role: 'assistant', content: '前端' }, finish_reason: 'stop' }
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }) as typeof fetch
  return () => {
    globalThis.fetch = orig
  }
}

const fakeRepo: Repo = {
  id: 1,
  full_name: 'foo/bar',
  description: '演示仓库',
  language: 'TypeScript',
  stargazers_count: 1234,
  html_url: 'https://github.com/foo/bar',
  starred_at: new Date(0).toISOString(),
  topics: [],
  pushed_at: new Date(0).toISOString(),
  latest_release: null
}

async function main(): Promise<void> {
  console.log(`== 场景：MOCK_MODE=${process.env.MOCK_MODE} ==\n`)

  // ---------- 1) 纯函数 ----------
  console.log('=== 1) isLocalEndpoint：本机端点判定 ===')
  check('http://localhost:11434/v1', isLocalEndpoint('http://localhost:11434/v1'))
  check('http://127.0.0.1:1234/v1', isLocalEndpoint('http://127.0.0.1:1234/v1'))
  check('http://[::1]:1234/v1', isLocalEndpoint('http://[::1]:1234/v1'))
  check('大写主机名同样认', isLocalEndpoint('http://LOCALHOST:11434/v1'))
  check('普通域名不算本地', !isLocalEndpoint('https://api.deepseek.com/v1'))
  check('空串不算本地', !isLocalEndpoint(''))
  check('缺协议头的半截地址不算本地（解析不了就别猜）', !isLocalEndpoint('localhost:11434/v1'))
  check(
    '不含 localhost 字样的域名不能被误判',
    !isLocalEndpoint('https://api.localhost-proxy.example.com/v1')
  )

  console.log('\n=== 1) matchPreset：URL → 预设 ===')
  check('精确命中', matchPreset('https://api.deepseek.com/v1')?.id === 'deepseek')
  check('尾斜杠仍命中', matchPreset('https://api.deepseek.com/v1/')?.id === 'deepseek')
  check('大小写不敏感', matchPreset('HTTPS://API.DEEPSEEK.COM/V1')?.id === 'deepseek')
  check('空串不命中任何预设（它表示官方默认）', matchPreset('') === undefined)
  check('未知地址不命中', matchPreset('https://relay.example.com/v1') === undefined)

  console.log('\n=== 1) checkBaseUrl：/v1 不再是唯一正确后缀 ===')
  const issueText = (u: string): string => JSON.stringify(checkBaseUrl(u))
  check('空串不报问题', checkBaseUrl('').length === 0)
  check('标准 /v1 地址不报问题', checkBaseUrl('https://api.deepseek.com/v1').length === 0, issueText('https://api.deepseek.com/v1'))
  check(
    '智谱的 /v4 不报问题（这条是本次要修的误报）',
    checkBaseUrl('https://open.bigmodel.cn/api/paas/v4').length === 0,
    issueText('https://open.bigmodel.cn/api/paas/v4')
  )
  check(
    'Gemini 兼容层的 /v1beta 不报问题',
    checkBaseUrl('https://generativelanguage.googleapis.com/v1beta').length === 0
  )
  check(
    '本地 http 端点不报「明文传输」',
    checkBaseUrl('http://localhost:11434/v1').length === 0,
    issueText('http://localhost:11434/v1')
  )
  const noV1 = checkBaseUrl('https://api.deepseek.com')
  check('未知主机缺版本段会提示', noV1.length === 1 && noV1[0]?.level === 'warning', issueText('https://api.deepseek.com'))
  check('并给出可点的 /v1 建议', noV1[0]?.suggestV1 === 'https://api.deepseek.com/v1', noV1[0]?.suggestV1)
  const noScheme = checkBaseUrl('api.deepseek.com/v1')
  check('缺协议头是 danger 级', noScheme.length === 1 && noScheme[0]?.level === 'danger', issueText('api.deepseek.com/v1'))
  const insecure = checkBaseUrl('http://relay.example.com/v1')
  check('非本地的 http 地址提示明文传输', insecure.some((i) => i.message.includes('明文')), issueText('http://relay.example.com/v1'))

  // ---------- 2) 预设表自身 ----------
  console.log('\n=== 2) AI_PRESETS 表健全性 ===')
  const ids = AI_PRESETS.map((p) => p.id)
  check('id 唯一', new Set(ids).size === ids.length, ids.join(','))
  check(
    'baseUrl 均为空串或 https?:// 开头',
    AI_PRESETS.every((p) => p.baseUrl === '' || /^https?:\/\//i.test(p.baseUrl))
  )
  check('baseUrl 不带尾斜杠', AI_PRESETS.every((p) => !p.baseUrl.endsWith('/')))
  check(
    '只有 LM Studio 允许空模型名（它的模型取决于本地加载了哪个）',
    AI_PRESETS.filter((p) => p.model === '').map((p) => p.id).join(',') === 'lmstudio'
  )
  check(
    '每个预设的非空地址都不该触发自己的警告',
    AI_PRESETS.every((p) => p.baseUrl === '' || checkBaseUrl(p.baseUrl).length === 0),
    AI_PRESETS.filter((p) => p.baseUrl !== '' && checkBaseUrl(p.baseUrl).length > 0)
      .map((p) => p.id)
      .join(',')
  )
  check(
    'keyUrl 一律 https',
    AI_PRESETS.every((p) => !p.keyUrl || p.keyUrl.startsWith('https://'))
  )

  // ---------- 3~5) 真实分支 ----------
  const restore = installFetchStub()
  try {
    console.log('\n=== 3) resolveModel：自定义端点必须给模型名 ===')
    calls.length = 0
    config.setAiOverride({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1', model: '' })
    const probe = await ai.testConnection()
    check('探针不抛错，而是返回 ok:false', probe.ok === false, JSON.stringify(probe))
    check('报的是「未指定模型名」', probe.message.includes('未指定模型名'), probe.message)
    check('这一步一个请求都没发出去', calls.length === 0, `fetch ${calls.length} 次`)

    config.setAiOverride({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1', model: '' })
    let classifyErr = ''
    try {
      await ai.classify(fakeRepo)
    } catch (err) {
      classifyErr = err instanceof Error ? err.message : String(err)
    }
    check(
      '配置错误会从 classify 冒泡（不被静默降级成「其他」）',
      classifyErr.includes('未指定模型名'),
      classifyErr || '(没有抛错)'
    )
    check('这一步同样没发请求', calls.length === 0, `fetch ${calls.length} 次`)

    console.log('\n=== 3) resolveModel：官方端点仍沿用 gpt-4o-mini ===')
    calls.length = 0
    config.setAiOverride({ apiKey: 'sk-test', baseUrl: '', model: '' })
    await ai.classify(fakeRepo)
    check('发了一个请求', calls.length === 1, `fetch ${calls.length} 次`)
    check('模型名回落为 gpt-4o-mini', calls[0]?.model === 'gpt-4o-mini', calls[0]?.model)
    check(
      '请求打到 api.openai.com',
      (calls[0]?.url ?? '').includes('api.openai.com'),
      calls[0]?.url
    )

    console.log('\n=== 4) client 缓存键必须带上 baseUrl（本次修掉的 bug）===')
    calls.length = 0
    // key 完全不变，只换地址——旧实现会继续用缓存里那个指向 A 的 client
    config.setAiOverride({ apiKey: 'sk-same', baseUrl: 'https://a.example.com/v1', model: 'm-a' })
    await ai.classify(fakeRepo)
    config.setAiOverride({ apiKey: 'sk-same', baseUrl: 'https://b.example.com/v1', model: 'm-b' })
    await ai.classify(fakeRepo)
    check('两次请求都发出去了', calls.length === 2, `fetch ${calls.length} 次`)
    check('第一次打到 A', (calls[0]?.url ?? '').includes('a.example.com'), calls[0]?.url)
    check(
      '只换地址不换 Key，第二次真的打到 B（不是复用旧 client）',
      (calls[1]?.url ?? '').includes('b.example.com'),
      calls[1]?.url
    )
    check('模型名也跟着换成新的', calls[1]?.model === 'm-b', calls[1]?.model)

    console.log('\n=== 5) 本地端点免 Key ===')
    calls.length = 0
    config.setAiOverride({ apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' })
    const localProbe = await ai.testConnection()
    check('本地端点没有 Key 也能连（不再报「未配置 API Key」）', localProbe.ok === true, localProbe.message)
    check('请求打到了本机端口', (calls[0]?.url ?? '').includes('localhost:11434'), calls[0]?.url)

    console.log('\n=== 5) 非本地端点仍然要求 Key ===')
    calls.length = 0
    config.setAiOverride({ apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })
    const cloudProbe = await ai.testConnection()
    check('自定义云端端点没 Key 时返回 ok:false', cloudProbe.ok === false, cloudProbe.message)
    check('文案指向配置 Key', cloudProbe.message.includes('API Key'), cloudProbe.message)
    check('没有发请求', calls.length === 0, `fetch ${calls.length} 次`)
  } finally {
    restore()
    config.setAiOverride({})
  }

  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
