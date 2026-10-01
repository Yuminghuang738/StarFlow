// store.ts / local.ts 的打桩自检：脱离 Electron 直接跑，逐条验证 A1~A7 与 B0~B3 的行为契约。
//
// 跑法：node scripts/selfcheck/store-local.mjs
//   （驱动器会用 esbuild 打包本文件，把 electron 打桩成 scripts/selfcheck/electron-stub.mjs，
//     再分别在「无 keyring / 有 keyring」两个场景下各跑一遍。）
// 产物在 out/selfcheck/ 下（已 gitignore），本自检不接入 CI。
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import mockData from '../../mock-data.json'
import * as store from '../../src/main/store'
import * as local from '../../src/main/local'
import { dialog as stubDialog } from './electron-stub.mjs'

const EXPECTED_SEED = (mockData as { repos: unknown[] }).repos.length
const userData = app.getPath('userData')
const dbFile = join(userData, 'starflow.mock.db.json')
const readDb = (): string => readFileSync(dbFile, 'utf8')

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

async function main(): Promise<void> {
  console.log(`== 场景：MOCK_MODE=${process.env.MOCK_MODE} keyring=${process.env.SAFESTORAGE_MODE ?? 'available'} seed=${EXPECTED_SEED} ==\n`)

  // ---------- A5 播种 ----------
  const repos = await store.getRepos()
  check('A5 首次启动自动播种 mock 全量', repos.length === EXPECTED_SEED, `${repos.length} 条`)
  check('A5 种子已落盘', existsSync(dbFile), dbFile)

  // ---------- A3 缓存 ----------
  const again = await store.getRepos()
  check('A3 二次读取返回副本而非同一引用', again !== repos && again[0] !== repos[0])
  check('A3 二次读取内容一致', JSON.stringify(again) === JSON.stringify(repos))

  // ---------- A4 token ----------
  check('hasToken 保存前为 false', (await store.hasToken()) === false)

  if ((process.env.SAFESTORAGE_MODE ?? 'available') === 'none') {
    await store.saveToken('test-token-123')
    // (c)：无加密后端时 token 只留内存、一个字节都不写盘——所以这里断言的是"磁盘上什么都没有"，
    // 而不是旧结论 (a) 的"明文必须带 PLAIN: 前缀落盘"。
    const raw = readDb()
    check('A4 无 keyring 时不写盘', !raw.includes('test-token-123') && !raw.includes('PLAIN:'), raw.slice(0, 80))
    check('hasToken 保存后为 true', (await store.hasToken()) === true)
    // 名字必须如实：这个 PASS 靠的是"内存优先"，跟 PLAIN: 前缀已经没有任何关系。
    check('A4 无 keyring 时同进程内 getToken 返回内存中的 token', (await store.getToken()) === 'test-token-123')
  } else {
    await store.saveToken('test-token-123')
    const raw = readDb()
    check('A4 有 keyring 时落盘为密文', !raw.includes('test-token-123'))
    check('hasToken 保存后为 true', (await store.hasToken()) === true)
    check('getToken 能解出原文', (await store.getToken()) === 'test-token-123')

    // 换机器 / keyring 变更：解密失败必须降级，不能把应用搞崩
    process.env.SAFESTORAGE_KEY = 'key-B'
    check('A4 解密失败时 getToken 返回 null 且不抛', (await store.getToken()) === null)
    // 但 hasToken 问的是另一个问题——「用户到底配过没有」。它不能跟着一起降级成
    // false：false 在设置页的含义是「未配置」，那会把"读不出来"说成"没配过"。
    // 这里断言它抛出可读错误（渲染进程据此显示「读不到」+ 原因 + 重试）。
    await expectThrow(
      'A4 解密失败时 hasToken 抛错而不是谎报「未配置」',
      () => store.hasToken(),
      '解不开'
    )
    process.env.SAFESTORAGE_KEY = 'key-A'
    check('A4 换回原 keyring 后 hasToken 恢复为 true', (await store.hasToken()) === true)
  }

  await expectThrow('A4 空 token 被拒绝', () => store.saveToken(''), 'Token 不能为空')
  await expectThrow('A4 纯空白 token 被拒绝', () => store.saveToken('   '), 'Token 不能为空')

  // ---------- A6 updateLocalState ----------
  await store.updateLocalState('不存在的仓库', { cloned_path: 'x' }).then(
    () => check('A6 未找到仓库只 warn 不抛错', true),
    (err: unknown) => check('A6 未找到仓库只 warn 不抛错', false, String(err))
  )

  const target = repos[0].full_name
  await store.updateLocalState(target, { cloned_path: '/tmp/x' })
  await store.updateLocalState(target, { forked_full_name: 'me/x' })
  let current = (await store.getRepos()).find((r) => r.full_name === target)
  check('A6 两次更新后两个字段都在', current?.local?.cloned_path === '/tmp/x' && current?.local?.forked_full_name === 'me/x', JSON.stringify(current?.local))

  await store.updateLocalState(target, { cloned_path: undefined })
  current = (await store.getRepos()).find((r) => r.full_name === target)
  check('A6 undefined 不抹掉已有值', current?.local?.cloned_path === '/tmp/x', JSON.stringify(current?.local))

  const onDisk = JSON.parse(readDb()) as { repos: Array<{ full_name: string; local?: Record<string, unknown> }> }
  check('A6 缓存与磁盘一致', JSON.stringify(onDisk.repos.find((r) => r.full_name === target)?.local) === JSON.stringify(current?.local))

  // unstar 后不复活（进程内）
  await store.saveRepos((await store.getRepos()).filter((r) => r.full_name !== target))
  check('A3 saveRepos 后缓存同步', (await store.getRepos()).length === EXPECTED_SEED - 1)
  check('A3 被移除的仓库没有复活', !(await store.getRepos()).some((r) => r.full_name === target))

  // ---------- B1 chooseDir（mock 分支原样保留）----------
  const dir = await local.chooseDir()
  check('B1 mock 下 chooseDir 返回演示目录且已建', dir !== null && existsSync(dir), String(dir))

  // ---------- B2/B3 走真实分支 ----------
  process.env.MOCK_MODE = 'false'

  // B1 真实分支：用户取消 → null；选中 → 返回该路径；且必须把主窗口传给 dialog
  process.env.DIALOG_MODE = 'cancel'
  check('B1B 用户取消选择 → 返回 null', (await local.chooseDir()) === null)

  process.env.DIALOG_MODE = `pick:${userData}`
  check('B1C 用户选中目录 → 原样返回', (await local.chooseDir()) === userData)

  process.env.WINDOW_MODE = 'present'
  await local.chooseDir()
  check('B1D dialog 收到 parent window（模态）', stubDialog.lastArgCount === 2, `参数个数=${stubDialog.lastArgCount}`)
  delete process.env.WINDOW_MODE

  await expectThrow('B2A targetDir 不存在 → 中文提示', () => local.clone('vuejs/core', join(userData, 'nope')), '所选目录不存在')

  // 目标目录已存在：先手工造出 target，确认校验发生在 simple-git 之前（不联网也能拦下）
  mkdirSync(join(userData, 'core'), { recursive: true })
  await expectThrow('B2B 目标目录已存在 → 中文提示', () => local.clone('vuejs/core', userData), '目标目录已存在')

  // 真实 clone 失败路径：无论失败原因是网络还是仓库不存在，都必须是可读的中文包装
  const emptyDir = join(userData, 'empty')
  mkdirSync(emptyDir, { recursive: true })
  try {
    const cloned = await local.clone('P3-selfcheck/definitely-not-a-repo-xyz', emptyDir)
    check('B2C 真实 clone 失败 → 中文包装', false, `居然成功了：${cloned}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    check(
      'B2C 真实 clone 失败 → 中文包装',
      message.startsWith('克隆失败：') && message.includes('请确认本机已安装 git'),
      message.split('\n')[0]
    )
  }

  await expectThrow('B3 openDir 路径不存在 → 抛错', () => local.openDir(join(userData, 'nope')), '路径不存在')
  await local.openDir(userData)
  check('B3 openDir 真实目录 → 正常返回', true)

  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
