// 推荐链路自检的驱动器：esbuild 打包 recommend-search-entry.ts（electron 打桩），
// 再用一个固定 RUN_ID 起子进程，保证可复现。
//
// 用法：node scripts/selfcheck/recommend-search.mjs
// 全程 MOCK_MODE=true：不需要 GitHub Token、不需要 AI Key、不发任何网络请求。
// 产物放 out/selfcheck/（已 gitignore），本脚本不接入 CI。
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
  const out = await bundle('recommend-search-entry.ts', 'recommend-search-bundle.mjs')

  const runId = 'recommend-search'
  // 跑前清库：残留数据会让"已 Star 的不再推荐"这类断言时真时假
  rmSync(join(outDir, 'data', runId), { recursive: true, force: true })

  const code = await run([out], {
    ...process.env,
    RUN_ID: runId,
    MOCK_MODE: 'true',
    SAFESTORAGE_MODE: 'none',
    // 显式清掉 .env 可能带进来的 AI Key：本自检要验的正是"没有 AI 也能用"
    OPENAI_API_KEY: ''
  })

  console.log(`\n== 驱动器汇总：${code === 0 ? '全部通过' : '存在失败'} ==`)
  process.exit(code)
}

void main()
