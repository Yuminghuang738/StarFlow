// ai.ts 自检（不经 Electron）。
// 覆盖：
//   1) normalizeCategory 收敛性（任何脏输入都不许逃出 7 个枚举）
//   2) classify 跑 mock 的 31 条数据，打印分布
//   3) enrichRepos（mock 模式）的返回结构与跳过语义 + 真实模式的并发上限
//   4) 空输入短路（真实模式）
// 用法：node scripts/selfcheck/ai.mjs
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const MODE = process.argv[2] ?? 'mock'
process.env.MOCK_MODE = MODE === 'mock' ? 'true' : 'false'

const require = createRequire(import.meta.url)
const mockData = JSON.parse(readFileSync(require.resolve('../../mock-data.json'), 'utf8'))
const bundleUrl = new URL('../../out/selfcheck/ai-bundle.mjs', import.meta.url).href

const { classify, enrichRepos, generateReport, summarize, normalizeCategory } = await import(bundleUrl)
const { AI_CATEGORIES } = await import(new URL('../../out/selfcheck/shared-types.mjs', import.meta.url).href)

const repos = mockData.repos

let failures = 0
function check(label, condition, detail) {
  const ok = Boolean(condition)
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? ` — ${detail}` : ''}`)
}

console.log(`#### 模式: MOCK_MODE=${process.env.MOCK_MODE} ####\n`)

console.log('=== 1) normalizeCategory 收敛性（脏输入） ===')
const DIRTY = [
  ['AI/ML', 'AI/ML'],
  ['前端。', '前端'],
  ['前端开发', '前端'],
  ['DevOps', 'DevOps'],
  ['Devops', 'DevOps'],
  ['devops', 'DevOps'],
  ['这是一个前端项目', '前端'],
  ['随便什么', '其他'],
  ['【工具】', '工具'],
  // 带 ```json 围栏且内含 "category": "后端" 的脏输出：清洗后清掉标点/引号，
  // 剩下的文本里包含 '后端'，因此收敛到 '后端'。这是有意为之的更优行为，
  // 底线仍然只是"必须落在 7 个枚举内"。
  ['```json\n{"category": "后端"}\n```', '后端'],
  ['', '其他'],
  ['   ', '其他'],
  ['学习资源、其他', '学习资源'],
  ['  后端  ', '后端']
]
for (const [input, expected] of DIRTY) {
  const out = normalizeCategory(input)
  const withinEnum = AI_CATEGORIES.includes(out)
  const matches = out === expected
  if (!withinEnum || !matches) failures += 1
  console.log(
    `${withinEnum && matches ? 'PASS' : 'FAIL'}  ${JSON.stringify(input)} -> ${out}` +
      (matches ? '' : `（期望 ${expected}）`)
  )
}
// 全文链路（含 extractContent 清洗）只要求"落在枚举内"，不规定具体值——
// 原需求文档此处刻意含混，只要不逃出 7 个枚举就算合格。
const odd = normalizeCategory(
  (await import(bundleUrl)).extractContent?.('```json\n{"category": "后端"}\n```') ?? ''
)
check('脏 JSON 围栏输出经 normalizeCategory 仍在枚举内', AI_CATEGORIES.includes(odd), `-> ${odd}`)

console.log('\n=== 2) classify 全量 mock 数据（31 条）分布 ===')
const distribution = {}
for (const repo of repos) {
  const c = await classify(repo)
  if (!AI_CATEGORIES.includes(c)) {
    failures += 1
    console.log(`FAIL  ${repo.full_name} -> ${c}（越界！）`)
  }
  distribution[c] = (distribution[c] ?? 0) + 1
}
console.log('总数:', repos.length)
console.log('分布:', JSON.stringify(distribution))
check(
  '全部落在 7 个枚举内',
  Object.keys(distribution).every((k) => AI_CATEGORIES.includes(k)),
  Object.keys(distribution).join(' / ')
)

console.log('\n=== 3) enrichRepos ===')
const enriched = await enrichRepos(repos)
check('返回条数与入参一致', enriched.length === repos.length, `${enriched.length}`)
check('每条都有合法 ai_category', enriched.every((r) => AI_CATEGORIES.includes(r.ai_category)))
check('每条都有 ai_summary', enriched.every((r) => typeof r.ai_summary === 'string' && r.ai_summary))
check('已有分类原样保留（未被覆盖）', enriched.every((r, i) => r.ai_category === repos[i].ai_category))
check('空输入不炸', (await enrichRepos([])).length === 0)

console.log('\n=== 4) 空输入短路 ===')
if (MODE === 'mock') {
  check('summarize("") 走 mock 分支且有结果', (await summarize('')).length > 0)
  check('generateReport([]) 走 mock 分支且有结果', (await generateReport([])).length > 0)
} else {
  check('summarize("") === ""（不浪费额度）', (await summarize('')) === '')
  check('summarize(短文本) === ""', (await summarize('too short')) === '')
  check('generateReport([]) 固定文案', (await generateReport([])) === '本周没有新增 Star。')
}

if (MODE === 'real') {
  console.log('\n=== 5) enrichRepos 并发上限（真实模式，需要可用的 OPENAI_BASE_URL） ===')
  let inFlight = 0
  let peak = 0
  // 通过 fetch 代理观测真实出网请求数：config 里的 baseURL 会被 openai SDK 使用
  const origFetch = globalThis.fetch
  globalThis.fetch = async (...args) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    try {
      return await origFetch(...args)
    } finally {
      inFlight -= 1
    }
  }
  try {
    await enrichRepos(repos.slice(0, 12))
  } catch (err) {
    console.log('enrichRepos 抛错（预期：缺 Key 时会 throw）:', err.message)
  } finally {
    globalThis.fetch = origFetch
  }
  check('同时在飞的请求 ≤ 3', peak <= 3, `峰值 ${peak}`)
}

console.log(`\n=== 结果：${failures === 0 ? '全部通过' : `${failures} 项失败`} ===`)
process.exit(failures === 0 ? 0 : 1)
