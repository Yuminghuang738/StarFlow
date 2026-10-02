// 周报派生数据自检的驱动器：esbuild 打包 → 起子进程跑。
//
// 与 collection-stats.mjs 同一套路：weekActivity.ts 只 import 了 @shared/types，
// ai-prompts.ts 也只 import @shared/types，两边都碰不到 electron / Node，
// 所以不需要打桩，也不需要 MOCK_MODE 之类的环境变量。
//
// 跑法：node scripts/selfcheck/week-report.mjs
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
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
    alias: { '@shared': join(projectRoot, 'src', 'shared') },
    logLevel: 'warning'
  })
  return out
}

const out = await bundle('week-report-entry.ts', 'week-report-bundle.mjs')

const code = await new Promise((resolve) => {
  const child = spawn(process.execPath, [out], { cwd: projectRoot, stdio: 'inherit' })
  child.on('exit', (c) => resolve(c ?? 1))
})

console.log(code === 0 ? '\n== 驱动器汇总：全部通过 ==' : `\n== 驱动器汇总：失败（exit ${code}）==`)
process.exit(code)
