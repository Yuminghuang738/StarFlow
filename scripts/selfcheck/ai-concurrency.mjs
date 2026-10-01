// 真实模式下的并发上限验证：起一个假的 OpenAI 兼容端点，观测同时在飞的请求数。
// 目的：确认 enrichRepos 严格只用 p-limit(3)，不会瞬时打满全部仓库。
// 用法：node scripts/selfcheck/ai-concurrency.mjs
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const repos = JSON.parse(readFileSync(require.resolve('../../mock-data.json'), 'utf8')).repos

let inFlight = 0
let peak = 0
let total = 0

const server = createServer((req, res) => {
  inFlight += 1
  total += 1
  peak = Math.max(peak, inFlight)
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    // 用延迟放大并发窗口，否则本地回包太快看不出来
    setTimeout(() => {
      // classify 的提示词里带着仓库全名，据此回一个合法分类
      const target = repos.find((r) => body.includes(r.full_name))
      const word = target?.ai_category ?? '工具'
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          created: 0,
          model: 'fake',
          choices: [{ index: 0, message: { role: 'assistant', content: word }, finish_reason: 'stop' }]
        })
      )
      inFlight -= 1
    }, 60)
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
console.log(`假 OpenAI 端点已启动: http://127.0.0.1:${port}/v1`)

process.env.MOCK_MODE = 'false'
process.env.OPENAI_API_KEY = 'sk-fake-for-selfcheck'
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`
process.env.MODEL_NAME = 'fake-model'

const { enrichRepos } = await import(
  new URL('../../out/selfcheck/ai-bundle.mjs', import.meta.url).href
)

// 让所有仓库都"缺分类缺摘要"，强制走真实请求路径
const bare = repos.map((r) => ({ ...r, ai_category: undefined, ai_summary: undefined }))

const started = Date.now()
const enriched = await enrichRepos(bare)
const elapsed = Date.now() - started

server.close()

let failures = 0
function check(label, condition, detail) {
  const ok = Boolean(condition)
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? ` — ${detail}` : ''}`)
}

console.log('')
check('输入仓库条数', bare.length === 31, `${bare.length}`)
check('全部返回', enriched.length === 31, `${enriched.length}`)
check('每条都拿到了分类', enriched.every((r) => typeof r.ai_category === 'string' && r.ai_category))
check('并发峰值 ≤ 3', peak <= 3, `峰值 ${peak}`)
check('确实发生了并发（不是串行）', peak === 3, `峰值 ${peak}`)
console.log(`总请求数 ${total}，耗时 ${elapsed}ms`)
if (total === 0) {
  failures += 1
  console.log('FAIL  没有观测到任何请求，测试无效')
}
// 31 条 × 60ms / 3 并发 ≈ 620ms；如果串行会 >1800ms
console.log(`串行下限约 ${31 * 60}ms，并发 3 的理论值约 ${Math.ceil((31 * 60) / 3)}ms`)

console.log(`\n=== 结果：${failures === 0 ? '全部通过' : `${failures} 项失败`} ===`)
process.exit(failures === 0 ? 0 : 1)
