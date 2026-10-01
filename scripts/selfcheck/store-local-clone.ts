// local.clone / openDir 的真实分支自检（MOCK_MODE=false，会真的联网 clone）。
// 跑法：node scripts/selfcheck/store-local.mjs clone
// 前置：本机能访问 github.com。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as local from '../../src/main/local'

process.env.MOCK_MODE = 'false'

let passCount = 0
let failCount = 0
function check(name: string, ok: boolean, extra = '') {
  if (ok) passCount++
  else failCount++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`)
}

const base = join(process.cwd(), 'out', 'selfcheck', 'clonetest-harness')

console.log('== B2 真实 clone 成功路径 ==')
const t0 = Date.now()
const target = await local.clone('octocat/Hello-World', base)
const cost = Date.now() - t0
check('B2 返回完整绝对路径', target === join(base, 'Hello-World'), target)
check('B2 目标目录下 .git 存在（是完整 git 仓库）', existsSync(join(target, '.git')))
check('B2 工作区文件已检出', existsSync(join(target, 'README')))
console.log(`     克隆耗时 ${cost}ms`)

console.log('== B2 目标已存在（真实分支，非 mock）==')
try {
  await local.clone('octocat/Hello-World', base)
  check('B2 目标已存在 → 应抛中文错', false, '没有抛错')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  check('B2 目标已存在 → 抛中文错', msg.includes('目标目录已存在'), msg)
}

console.log('== B2 targetDir 不存在 ==')
try {
  await local.clone('octocat/Hello-World', join(base, 'no-such-dir'))
  check('B2 targetDir 不存在 → 应抛中文错', false, '没有抛错')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  check('B2 targetDir 不存在 → 抛中文错', msg.includes('所选目录不存在'), msg)
}

console.log('== B3 openDir 真实目录（真打开文件管理器）==')
try {
  await local.openDir(target)
  check('B3 openDir 真实目录 → 不抛错', true)
} catch (err) {
  check('B3 openDir 真实目录 → 不抛错', false, err instanceof Error ? err.message : String(err))
}

console.log(`\n== 汇总：PASS ${passCount} / FAIL ${failCount} ==`)
if (failCount > 0) process.exitCode = 1
