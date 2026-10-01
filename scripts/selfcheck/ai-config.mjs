// AI 配置链路自检的驱动器：用 esbuild 把 ai-config-entry.ts 打成 ESM bundle
// （electron 打桩成 scripts/selfcheck/electron-stub.mjs），再按场景起子进程。
//
// 用法：node scripts/selfcheck/ai-config.mjs
//   场景一：无 keyring（SAFESTORAGE_MODE=none）—— 验证「一个字节都不写盘」的内存降级
//   场景二：有 keyring（SAFESTORAGE_MODE=available）—— 验证密文落盘与解密回读
// 产物统一放 out/selfcheck/（已 gitignore），本脚本不接入 CI。
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
  const out = await bundle('ai-config-entry.ts', 'ai-config-bundle.mjs')
  const scenarios = [
    { id: 'ai-config-nokeyring', keyring: 'none' },
    { id: 'ai-config-keyring', keyring: 'available' }
  ]

  let failed = 0
  for (const s of scenarios) {
    // 固定 RUN_ID 保证可复现；跑前清掉上一轮的库文件，否则残留数据会带偏断言。
    rmSync(join(outDir, 'data', s.id), { recursive: true, force: true })
    console.log(`\n######## 场景 ${s.id}（SAFESTORAGE_MODE=${s.keyring}）########`)
    const code = await run([out], {
      ...process.env,
      RUN_ID: s.id,
      MOCK_MODE: 'true',
      SAFESTORAGE_MODE: s.keyring,
      // 显式给 "env 来源" 一组确定的值，不受调用者环境干扰
      OPENAI_API_KEY: 'env-key-abc',
      OPENAI_BASE_URL: 'http://env.example/v1',
      MODEL_NAME: 'env-model'
    })
    if (code !== 0) failed++
  }

  console.log(`\n== 驱动器汇总：${failed === 0 ? '全部通过' : `${failed} 项失败`} ==`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
