// AI 配置链路自检：脱离 Electron 直接跑，逐条验证「设置页填 key → 立即生效」这条路。
//
// 跑法：node scripts/selfcheck/ai-config.mjs
//   驱动器用 esbuild 打包本文件（electron 打桩成 scripts/selfcheck/electron-stub.mjs），
//   再分别在「无 keyring / 有 keyring」两个场景各跑一遍。
//
// 覆盖（对应任务书第 6 节）：
//   1) saveAiConfig / getAiKey / clearAiKey 的密文落盘 与 内存降级 两条分支
//   2) getEnv() 覆盖层优先级：界面 > .env > 空串
//   3) getAiConfig() 返回对象不含 key（对序列化结果断言）
//   4) source 三种取值都对
//   5) prompt 纯函数的字符串断言（classify 含全部 7 枚举、周报含「不得编造」）
//   6) testConnection() 在 Mock 模式下不发真实请求
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import * as store from '../../src/main/store'
import * as config from '../../src/main/config'
import * as ai from '../../src/main/ai'
import { summarizePrompt, classifyPrompt, reportPrompt } from '../../src/main/ai-prompts'
import { AI_CATEGORIES } from '@shared/types'
import type { Repo } from '@shared/types'

// 驱动器通过 SAFESTORAGE_MODE 控制桩后端：'none' 模拟没有 keyring 的 Linux。
const ENCRYPTED = (process.env.SAFESTORAGE_MODE ?? 'none') !== 'none'
const dbFile = join(app.getPath('userData'), 'starflow.mock.db.json')
const readDb = (): string => readFileSync(dbFile, 'utf8')

const STORE_KEY = 'ui-store-key-123'
const STORE_BASE = 'http://ui.example/v1'
const STORE_MODEL = 'ui-model'
const ENV_KEY = 'env-key-abc'
const ENV_BASE = 'http://env.example/v1'
const ENV_MODEL = 'env-model'

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20))

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}
async function expectThrow(name: string, fn: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await fn()
    check(name, false, '没有抛错')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    check(name, message.includes(expected), message)
  }
}

/** reportPrompt / classifyPrompt 只需要一个字段齐全的最小 Repo */
const fakeRepo: Repo = {
  id: 1,
  full_name: 'foo/bar',
  description: '一个演示用的仓库',
  language: 'TypeScript',
  stargazers_count: 1234,
  html_url: 'https://github.com/foo/bar',
  starred_at: '2026-01-01T00:00:00Z',
  topics: ['cli', 'tool'],
  pushed_at: null,
  latest_release: null
}

async function main(): Promise<void> {
  console.log(
    `== 场景：MOCK_MODE=${process.env.MOCK_MODE} keyring=${process.env.SAFESTORAGE_MODE ?? 'none'} ==\n`
  )

  // ---------- 2) getEnv 覆盖层优先级：界面 > .env > 空串 ----------
  console.log('=== 2) getEnv 覆盖层优先级 ===')
  config.setAiOverride({})
  check('未设覆盖层时 openaiKey 取 .env', config.getEnv().openaiKey === ENV_KEY, config.getEnv().openaiKey)
  config.setAiOverride({ apiKey: 'ui-key' })
  check('界面覆盖层优先于 .env', config.getEnv().openaiKey === 'ui-key', config.getEnv().openaiKey)
  config.setAiOverride({ apiKey: '' })
  check('覆盖层为空串时回退 .env', config.getEnv().openaiKey === ENV_KEY, config.getEnv().openaiKey)
  config.setAiOverride({ baseUrl: 'http://ui-only/v1', model: 'ui-only-model' })
  check(
    'baseUrl / model 覆盖层同样生效',
    config.getEnv().openaiBaseUrl === 'http://ui-only/v1' && config.getEnv().modelName === 'ui-only-model'
  )
  const savedEnvKey = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  config.setAiOverride({})
  check('界面与 .env 都没有时为空串', config.getEnv().openaiKey === '', JSON.stringify(config.getEnv().openaiKey))
  process.env.OPENAI_API_KEY = savedEnvKey
  config.setAiOverride({})

  // ---------- 4) source === 'env' ----------
  console.log('\n=== 4) getAiConfig：无界面 key 时 source === "env" ===')
  const envCfg = await store.getAiConfig()
  check('source === "env"', envCfg.source === 'env', envCfg.source)
  check('hasKey === true', envCfg.hasKey === true)
  check('baseUrl 回落到 .env', envCfg.baseUrl === ENV_BASE, envCfg.baseUrl)
  check('model 回落到 .env', envCfg.model === ENV_MODEL, envCfg.model)

  // ---------- 1) saveAiConfig / getAiKey ----------
  console.log('\n=== 1) saveAiConfig / getAiKey：密文落盘 vs 内存降级 ===')
  await store.saveAiConfig({ apiKey: STORE_KEY, baseUrl: STORE_BASE, model: STORE_MODEL })
  const raw = readDb()
  if (ENCRYPTED) {
    check('有 keyring：磁盘上不含明文 key', !raw.includes(STORE_KEY))
    check('有 keyring：磁盘 aiKey 非 null（已写密文）', /"aiKey":\s*"[^"]+"/.test(raw))
    check('有 keyring：getAiKey 能解出原文', (await store.getAiKey()) === STORE_KEY)
  } else {
    // (c) 的核心：无加密后端时一个字节都不写盘，key 只活在主进程内存里。
    check('无 keyring：磁盘上不含明文 key', !raw.includes(STORE_KEY) && !raw.includes('PLAIN:'))
    check('无 keyring：磁盘 aiKey 为 null', /"aiKey":\s*null/.test(raw))
    check('无 keyring：同进程内 getAiKey 返回内存中的 key', (await store.getAiKey()) === STORE_KEY)
  }
  check('明文 baseUrl 可回传（不是秘密）', raw.includes(STORE_BASE))

  // ---------- 4) source === 'store' ----------
  console.log('\n=== 4) getAiConfig：界面存了 key 时 source === "store" ===')
  const storeCfg = await store.getAiConfig()
  check('source === "store"', storeCfg.source === 'store', storeCfg.source)
  check('hasKey === true', storeCfg.hasKey === true)
  check('baseUrl 取界面存的', storeCfg.baseUrl === STORE_BASE, storeCfg.baseUrl)
  check('model 取界面存的', storeCfg.model === STORE_MODEL, storeCfg.model)

  // ---------- 3) 视图不含 key ----------
  console.log('\n=== 3) getAiConfig 返回对象不含 apiKey ===')
  const serialized = JSON.stringify(storeCfg)
  check('序列化结果不含密钥明文', !serialized.includes(STORE_KEY))
  check('对象上没有 apiKey 字段', !('apiKey' in storeCfg) && !serialized.includes('"apiKey"'), serialized)

  // ---------- 1) 空 key 拒绝 ----------
  await expectThrow('空 apiKey 被拒绝', () => store.saveAiConfig({ apiKey: '' }), 'API Key 不能为空')
  await expectThrow('纯空白 apiKey 被拒绝', () => store.saveAiConfig({ apiKey: '   ' }), 'API Key 不能为空')

  // ---------- refreshAiConfigCache 打通 store -> config ----------
  console.log('\n=== refreshAiConfigCache：store 里的配置灌进 config 覆盖层 ===')
  config.setAiOverride({})
  ai.refreshAiConfigCache()
  await tick()
  check('refresh 后 getEnv 取到界面 key', config.getEnv().openaiKey === STORE_KEY, config.getEnv().openaiKey)
  check(
    'refresh 后 baseUrl / model 也来自界面',
    config.getEnv().openaiBaseUrl === STORE_BASE && config.getEnv().modelName === STORE_MODEL
  )

  // ---------- 1) clearAiKey ----------
  console.log('\n=== 1) clearAiKey：先写盘再清内存，只清 key 保留 baseUrl/model ===')
  await store.clearAiKey()
  check('清除后磁盘 aiKey 为 null', /"aiKey":\s*null/.test(readDb()))
  check('清除后 getAiKey 返回 null', (await store.getAiKey()) === null)
  const clearedCfg = await store.getAiConfig()
  check("清除后 source 回退到 'env'", clearedCfg.source === 'env', clearedCfg.source)
  check('清除后 baseUrl 保留', clearedCfg.baseUrl === STORE_BASE, clearedCfg.baseUrl)
  config.setAiOverride({})
  ai.refreshAiConfigCache()
  await tick()
  check('清除并 refresh 后 getEnv 回退到 .env key', config.getEnv().openaiKey === ENV_KEY, config.getEnv().openaiKey)

  // ---------- 4) source === 'none' ----------
  console.log('\n=== 4) getAiConfig：界面与 .env 都没有时 source === "none" ===')
  const savedKey2 = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  const noneCfg = await store.getAiConfig()
  check('source === "none" 且 hasKey === false', noneCfg.source === 'none' && noneCfg.hasKey === false, noneCfg.source)
  process.env.OPENAI_API_KEY = savedKey2

  // ---------- 5) prompt 纯函数 ----------
  console.log('\n=== 5) prompt 纯函数字符串断言 ===')
  const cp = classifyPrompt(fakeRepo)
  check('classify prompt 含全部 7 个枚举', AI_CATEGORIES.every((c) => cp.includes(c)), AI_CATEGORIES.join('/'))
  check('classify prompt 带上了仓库信息', cp.includes(fakeRepo.full_name))
  const rp = reportPrompt([fakeRepo])
  check('周报 prompt 含「不得编造」', rp.includes('不得编造'))
  check('周报 prompt 含给定仓库', rp.includes(fakeRepo.full_name))
  const sp = summarizePrompt('干净内容'.repeat(20))
  check('摘要 prompt 含忽略徽章/CI 的要求', sp.includes('徽章'))
  check('摘要 prompt 把 README 截断到 6000 字符', !summarizePrompt('x'.repeat(9000)).includes('x'.repeat(7000)))
  check('prompt 是纯函数（同输入同输出）', cp === classifyPrompt(fakeRepo) && rp === reportPrompt([fakeRepo]))

  // ---------- 6) testConnection（Mock 模式） ----------
  console.log('\n=== 6) testConnection：Mock 模式不发起真实请求 ===')
  let fetchCalls = 0
  const origFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    fetchCalls++
    throw new Error('Mock 模式下不应发起真实请求')
  }) as typeof fetch
  try {
    const r = await ai.testConnection()
    check('返回 ok: true', r.ok === true, JSON.stringify(r))
    check('message 说明是 Mock 模式', r.message.includes('Mock'), r.message)
    check('没有发起任何真实请求', fetchCalls === 0, `fetch 调用 ${fetchCalls} 次`)
  } finally {
    globalThis.fetch = origFetch
  }

  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
