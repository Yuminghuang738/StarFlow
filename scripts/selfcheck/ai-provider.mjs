// AI 端点通用化自检的驱动器：esbuild 打包 ai-provider-entry.ts（electron 打桩），
// 再用一个固定 RUN_ID 起子进程，保证可复现。
//
// 用法：node scripts/selfcheck/ai-provider.mjs
//
// 与 recommend-search.mjs 的关键差别：这里 **MOCK_MODE=false**——要验的正是真实分支。
// 不发真实请求由入口里的 globalThis.fetch 打桩负责（它同时断言了调用次数）。
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = join(here, '..', '..')
const outDir = join(projectRoot, 'out', 'selfcheck')

async function bundle(entry, outfile) {
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, outfile)
  await build({
    entryPoints: [join(here, entry)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    // 不能省：否则 dotenv 那类 CJS 动态 require 会让 ESM 打包直接失败。
    packages: 'external',
    alias: {
      '@shared': join(projectRoot, 'src', 'shared'),
      electron: join(here, 'electron-stub.mjs')
    },
    logLevel: 'warning'
  })
  return out
}

function run(args, env, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: projectRoot, env, stdio: 'inherit' })
    const timer = setTimeout(() => {
      console.log(`\n[driver] 子进程超过 ${Math.round(timeoutMs / 1000)}s 未退出，强制结束`)
      child.kill()
    }, timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code ?? 1)
    })
  })
}

async function main() {
  const out = await bundle('ai-provider-entry.ts', 'ai-provider-bundle.mjs')

  const runId = 'ai-provider'
  rmSync(join(outDir, 'data', runId), { recursive: true, force: true })

  const code = await run([out], {
    ...process.env,
    RUN_ID: runId,
    // 刻意打开真实分支：本自检要验 resolveModel / client 缓存，mock 分支不会走到那里
    MOCK_MODE: 'false',
    SAFESTORAGE_MODE: 'none',
    // 清掉 .env 可能带进来的值，避免覆盖层之外的默认值干扰断言
    OPENAI_API_KEY: '',
    OPENAI_BASE_URL: '',
    MODEL_NAME: ''
  })

  console.log(`\n== 驱动器汇总：${code === 0 ? '全部通过' : '存在失败'} ==`)
  process.exit(code)
}

void main()
