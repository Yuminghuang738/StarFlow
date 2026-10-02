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
import * as store from '../../src/main/store'
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
/**
 * 请求体里含其中**任意**一个子串的对话请求，就回 400（空数组 = 全部正常）。
 * 用 400 而不是 5xx：openai SDK 对 5xx 会自动重试两次，既拖慢自检，又让调用次数难以断言。
 * 之所以按「请求体含子串」筛选而不是按 URL，是因为同一批补全的 URL 完全相同，
 * 只能靠 prompt 里带的仓库全名区分是哪一个仓库的请求。
 */
let failBody: string[] = []

function installFetchStub(): () => void {
  const orig = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const raw = typeof init?.body === 'string' ? init.body : ''
    let model = ''
    if (raw !== '') {
      try {
        const parsed = JSON.parse(raw) as { model?: unknown }
        model = typeof parsed.model === 'string' ? parsed.model : ''
      } catch {
        model = '(解析失败)'
      }
    }
    calls.push({ url, model })

    if (failBody.some((needle) => raw.includes(needle))) {
      return new Response(JSON.stringify({ error: { message: 'stub 400：这次就是要它失败' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }

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
    failBody = []
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

/** 同一批里的第二个仓库，用来测「部分失败」 */
const fakeRepo2: Repo = { ...fakeRepo, id: 2, full_name: 'foo/baz' }

/**
 * 「只差分类」的副本：故意给上 ai_summary 而空着 ai_category。
 *
 * 两个作用：1) 不会命中 enrichRepos 第一句「两个字段都齐了直接跳过」，所以一定会去问模型；
 * 2) **跳过抓 README 那一步**——那一步走的是 Octokit，不经过本文件的 fetch 打桩，
 *    真的会往 api.github.com 发请求。自检不该出网。
 */
function needsCategory(base: Repo): Repo {
  return { ...base, ai_summary: '已有摘要', ai_category: undefined }
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

    console.log('\n=== 6) 分类全军覆没：不许把一份全「其他」的结果当成功写盘 ===')
    config.setAiOverride({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })

    // 先跑一次正常的：两个仓库都补全成功，落盘。这一步同时是后面那个"没被覆盖"的基线。
    //
    // 前置：库里先要有这两条——应用里传进来的那份就是"从库里读出来的渲染层列表"，
    // 而 enrichRepos 现在是**以库为准**合并的（补全期间被取消收藏的不该被复活），
    // 库里没有的条目不会凭空被插进去。所以这里要先把前置条件摆成应用里的样子。
    await store.saveRepos([fakeRepo, fakeRepo2])
    calls.length = 0
    const okBatch = await ai.enrichRepos([needsCategory(fakeRepo), needsCategory(fakeRepo2)])
    check('两个仓库都拿到了分类', okBatch.every((r) => r.ai_category === '前端'), JSON.stringify(okBatch.map((r) => r.ai_category)))
    check(
      '整段只打对话接口，一个 GitHub 请求都没发（否则就是自检出网了）',
      calls.every((c) => c.url.includes('/chat/completions')),
      calls.map((c) => c.url).join(' | ')
    )
    const savedOk = await store.getRepos()
    check('成功的结果落了盘', savedOk.length === 2, `${savedOk.length} 条`)

    // 再跑一次：这次每个仓库的请求都回 400（非配置类失败 → classify 内部降级）。
    // 「降级」是 classify 的对外契约，但 enrichRepos 不能把降级当成补全成功。
    failBody = ['foo/']
    calls.length = 0
    let allFailErr = ''
    try {
      // 用抹掉分类的副本，否则会被"两个字段都齐了直接跳过"提前返回，压根不会发请求
      await ai.enrichRepos([needsCategory(fakeRepo), needsCategory(fakeRepo2)])
    } catch (err) {
      allFailErr = err instanceof Error ? err.message : String(err)
    }
    check('每个仓库都失败 → 整批抛错', allFailErr.includes('一个都没分类成功'), allFailErr || '(没有抛错)')
    check('报错里带上了失败个数', allFailErr.includes('2 个仓库'), allFailErr)
    check('确实去问了模型（不是提前返回）', calls.length >= 2, `fetch ${calls.length} 次`)

    const afterAllFail = await store.getRepos()
    check('磁盘上还是上一次成功的那两条', afterAllFail.length === 2, `${afterAllFail.length} 条`)
    check(
      '原有的分类没有被「其他」覆盖',
      afterAllFail.every((r) => r.ai_category === '前端'),
      JSON.stringify(afterAllFail.map((r) => r.ai_category))
    )

    console.log('\n=== 6) 部分失败：成功的照常写盘，失败的既有结论不被动、新结论不臆造 ===')
    // 再加一个"从来没分类过"的仓库，用来区分两种失败：已有分类的不能被抹掉，
    // 没有分类的不能凭空长出一个「其他」。
    const neverCategorized: Repo = { ...fakeRepo, id: 4, full_name: 'foo/never-categorized' }
    await store.saveRepos([...(await store.getRepos()), neverCategorized])

    failBody = ['foo/baz', 'foo/never']
    calls.length = 0
    let partialErr = ''
    let partial: Repo[] = []
    try {
      partial = await ai.enrichRepos([
        needsCategory(fakeRepo),
        needsCategory(fakeRepo2),
        needsCategory(neverCategorized)
      ])
    } catch (err) {
      partialErr = err instanceof Error ? err.message : String(err)
    }
    const cat = (name: string): string | undefined =>
      partial.find((r) => r.full_name === name)?.ai_category
    check('部分失败不抛错', partialErr === '', partialErr)
    check(
      '从来没分类过的失败后仍是「未分类」，没有臆造出一个「其他」',
      cat('foo/never-categorized') === undefined,
      String(cat('foo/never-categorized'))
    )
    check(
      '原本已有分类的失败后保留原分类（不被「其他」顶掉）',
      cat('foo/baz') === '前端',
      String(cat('foo/baz'))
    )
    check('成功的那个正常拿到分类', cat('foo/bar') === '前端', String(cat('foo/bar')))
    const savedPartial = await store.getRepos()
    check(
      '落盘的结果里也没有「其他」这种假值',
      savedPartial.every((r) => r.ai_category !== '其他'),
      JSON.stringify(savedPartial.map((r) => [r.full_name, r.ai_category]))
    )

    console.log('\n=== 7) 补全期间的改动不能被那份旧快照覆盖（数据丢失）===')
    failBody = []
    // 承接上一节的库内容。模拟补全进行中用户干的三件事：
    await store.updateLocalState('foo/bar', { cloned_path: '/tmp/一次补全期间的克隆' })
    const newlyStarred: Repo = {
      ...fakeRepo,
      id: 3,
      full_name: 'foo/newly-starred',
      starred_at: new Date().toISOString()
    }
    await store.saveRepos([...(await store.getRepos()), newlyStarred])

    // 补全的入参是"开始那一刻"的快照：只有 foo/bar，外加一个**这期间已被取消收藏**的仓库
    const ghost: Repo = { ...fakeRepo, id: 9, full_name: 'foo/ghost' }
    calls.length = 0
    const merged = await ai.enrichRepos([needsCategory(fakeRepo), needsCategory(ghost)])

    check('补全期间 Star 进来的仓库还在', merged.some((r) => r.full_name === 'foo/newly-starred'))
    check(
      '补全期间的 clone 记录没被抹掉',
      merged.find((r) => r.full_name === 'foo/bar')?.local?.cloned_path === '/tmp/一次补全期间的克隆',
      JSON.stringify(merged.find((r) => r.full_name === 'foo/bar')?.local)
    )
    check(
      '该补全的那个补上了',
      merged.find((r) => r.full_name === 'foo/bar')?.ai_category === '前端',
      String(merged.find((r) => r.full_name === 'foo/bar')?.ai_category)
    )
    check(
      '补全期间被取消收藏的没有被复活',
      !merged.some((r) => r.full_name === 'foo/ghost'),
      merged.map((r) => r.full_name).join(',')
    )
    const onDisk = await store.getRepos()
    check(
      '落盘的也是合并后的整份（不是补全入参那份）',
      onDisk.length === merged.length && onDisk.some((r) => r.full_name === 'foo/newly-starred'),
      `${onDisk.length} 条：${onDisk.map((r) => r.full_name).join(',')}`
    )
  } finally {
    restore()
    config.setAiOverride({})
  }

  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
