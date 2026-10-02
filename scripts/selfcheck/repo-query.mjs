// lib/repoQuery.ts 自检的驱动器：与 collection-stats.mjs 同一套路
// （esbuild 打包纯 TS 入口 → node 跑），repoQuery.ts 只 import @shared/types，
// 碰不到 electron / React / window.api，所以不需要打桩。
//
// 跑法：node scripts/selfcheck/repo-query.mjs
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

const out = await bundle('repo-query-entry.ts', 'repo-query-bundle.mjs')

const code = await new Promise((resolve) => {
  const child = spawn(process.execPath, [out], { cwd: projectRoot, stdio: 'inherit' })
  child.on('exit', (c) => resolve(c ?? 1))
})

console.log(code === 0 ? '\n== 驱动器汇总：全部通过 ==' : `\n== 驱动器汇总：失败（exit ${code}）==`)
process.exit(code)
