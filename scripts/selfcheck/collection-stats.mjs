// 收藏总览统计自检的驱动器：用 esbuild 把 collection-stats-entry.ts 打成 ESM bundle 再跑。
//
// 与 ai-provider.mjs 同一套路（esbuild + 产物放项目内 out/），但更轻：
// collectionStats.ts 只 import 了 @shared/types 这个纯常量模块，碰不到 electron / Node，
// 所以不需要打桩，也不需要 MOCK_MODE 之类的环境变量。
//
// 跑法：node scripts/selfcheck/collection-stats.mjs
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

const out = await bundle('collection-stats-entry.ts', 'collection-stats-bundle.mjs')

const code = await new Promise((resolve) => {
  const child = spawn(process.execPath, [out], { cwd: projectRoot, stdio: 'inherit' })
  child.on('exit', (c) => resolve(c ?? 1))
})

console.log(code === 0 ? '\n== 驱动器汇总：全部通过 ==' : `\n== 驱动器汇总：失败（exit ${code}）==`)
process.exit(code)
