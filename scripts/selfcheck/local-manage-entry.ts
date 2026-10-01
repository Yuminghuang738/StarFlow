// local.ts 的「删除本地副本 + 磁盘对账」与 store.ts 的清除函数的打桩自检。
//
// 跑法：node scripts/selfcheck/local-manage.mjs
//   （驱动器用 esbuild 打包本文件，把 electron / simple-git 换成 scripts/selfcheck/
//     下的桩，再按 SCENARIO 起子进程。）
//
// 这是全项目唯一会**真正删除用户文件**的代码，所以重点全在闸门上：每一条"拒绝"
// 都要验证它确实拒绝了，而且没有顺手删掉别的东西。不需要 git 二进制——一个含
// .git 子目录的普通目录就足以构成合格的工作树。
//
// 本自检不接入 CI，与其它自检一致。
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type { LocalState, Repo } from '../../src/shared/types'
import * as local from '../../src/main/local'
import * as store from '../../src/main/store'

let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

async function expectThrow(
  name: string,
  fn: () => Promise<unknown>,
  expected: string
): Promise<void> {
  try {
    await fn()
    check(name, false, '没有抛错')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    check(name, message.includes(expected), message)
  }
}

function finish(): void {
  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

function msgOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function freshBase(tag: string): string {
  const base = join(tmpdir(), `starpilot-local-manage-${tag}-${process.pid}`)
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base, { recursive: true })
  return base
}

function makeRepo(fullName: string, localState?: LocalState): Repo {
  return {
    id: 1,
    full_name: fullName,
    description: null,
    language: null,
    stargazers_count: 0,
    html_url: `https://github.com/${fullName}`,
    starred_at: '2026-01-01T00:00:00Z',
    topics: [],
    pushed_at: null,
    latest_release: null,
    local: localState
  }
}

/** 造一个"看起来像 git 工作树"的目录：闸门 5 只要求有 .git，不需要真 clone */
function makeWorkTree(dir: string): void {
  mkdirSync(join(dir, '.git', 'objects'), { recursive: true })
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8')
}

interface DiskRepo {
  full_name: string
  local?: Record<string, unknown>
}

function readDisk(dbFile: string, fullName: string): DiskRepo | undefined {
  const parsed = JSON.parse(readFileSync(dbFile, 'utf8')) as { repos: DiskRepo[] }
  return parsed.repos.find((r) => r.full_name === fullName)
}

// ============================================================
// 场景 main：MOCK_MODE=false —— store 的清除函数 + removeClone 的全部闸门
// ============================================================

async function runMain(): Promise<void> {
  const base = freshBase('main')
  const dbFile = join(app.getPath('userData'), 'starpilot.db.json')

  // ---------- clearClonedPath / clearClonedPaths ----------
  // 先造三条：一条同时有 cloned_path 和 fork 标记（验证只删一个键）、
  // 一条只有 cloned_path、一条压根没有 local（验证不炸）
  await store.saveRepos([
    makeRepo('octocat/Hello-World', { cloned_path: '/tmp/hw', forked_full_name: 'me/hw' }),
    makeRepo('vuejs/core', { cloned_path: '/tmp/core' }),
    makeRepo('sindresorhus/awesome')
  ])

  await store.clearClonedPath('octocat/Hello-World')
  const hw = (await store.getRepos()).find((r) => r.full_name === 'octocat/Hello-World')
  check('clear 后 cloned_path 消失', hw?.local?.cloned_path === undefined, JSON.stringify(hw?.local))
  check(
    'clear 不动同一条 local 里的其他字段',
    hw?.local?.forked_full_name === 'me/hw',
    JSON.stringify(hw?.local)
  )

  const hwDisk = readDisk(dbFile, 'octocat/Hello-World')
  check(
    '磁盘上连 cloned_path 这个键都不剩',
    hwDisk?.local !== undefined && !('cloned_path' in hwDisk.local),
    JSON.stringify(hwDisk?.local)
  )
  // 这条才是"缓存没把旧值盖回来"的直接证据
  check(
    '磁盘与内存一致',
    JSON.stringify(hwDisk?.local) === JSON.stringify(hw?.local),
    `${JSON.stringify(hwDisk?.local)} vs ${JSON.stringify(hw?.local)}`
  )

  await store.clearClonedPaths(['vuejs/core', 'sindresorhus/awesome'])
  const after = await store.getRepos()
  check(
    '批量清除：两条都清了',
    after.every((r) => r.local?.cloned_path === undefined),
    JSON.stringify(after.map((r) => r.local))
  )
  check(
    '批量清除后磁盘上也没了',
    readDisk(dbFile, 'vuejs/core')?.local !== undefined &&
      !('cloned_path' in (readDisk(dbFile, 'vuejs/core')?.local ?? {})),
    JSON.stringify(readDisk(dbFile, 'vuejs/core')?.local)
  )

  let threw = ''
  try {
    await store.clearClonedPaths([])
  } catch (err) {
    threw = msgOf(err)
  }
  check('空数组不报错也不写盘', threw === '', threw)

  threw = ''
  try {
    await store.clearClonedPath('nobody/nothing')
  } catch (err) {
    threw = msgOf(err)
  }
  check('未命中仓库时只 warn 不抛', threw === '', threw)

  threw = ''
  try {
    // local 整个字段都不存在：delete undefined.cloned_path 会抛 TypeError，
    // 实现里那句 if (repo.local && ...) 就是为它写的
    await store.clearClonedPath('sindresorhus/awesome')
  } catch (err) {
    threw = msgOf(err)
  }
  check('仓库没有 local 字段时不抛', threw === '', threw)

  // ---------- removeClone：闸门 ----------
  // 闸门 3：根 / home
  await expectThrow(
    '拒绝删除 home 本身',
    () => local.removeClone('x/home', app.getPath('home')),
    '拒绝删除系统根目录或用户主目录'
  )
  await expectThrow(
    '拒绝删除文件系统根',
    () => local.removeClone('x/root', '/'),
    '拒绝删除系统根目录或用户主目录'
  )

  // 闸门 1：符号链接与非目录
  const realDir = join(base, 'real-target')
  makeWorkTree(realDir)
  const linkDir = join(base, 'link', 'Hello-World')
  mkdirSync(join(base, 'link'), { recursive: true })
  symlinkSync(realDir, linkDir, 'dir')
  await expectThrow(
    '拒绝删除顶层符号链接',
    () => local.removeClone('octocat/Hello-World', linkDir),
    '拒绝删除符号链接'
  )
  check('被拒绝的符号链接：目标是原封不动的', existsSync(join(realDir, '.git', 'HEAD')))

  const aFile = join(base, 'afile')
  writeFileSync(aFile, 'x', 'utf8')
  await expectThrow(
    '拒绝删除普通文件',
    () => local.removeClone('x/afile', aFile),
    '拒绝删除非目录'
  )
  check('被拒绝的文件还在', existsSync(aFile))

  // 闸门 4：目录名必须等于仓库名。
  // 这是最重要的一条：~/Documents 完全可能是个 git 仓库，前几道闸全过得了。
  const docs = join(base, 'Documents')
  makeWorkTree(docs)
  await expectThrow(
    '拒绝删除名字不匹配的 git 目录（~/Documents 的形态）',
    () => local.removeClone('octocat/Hello-World', docs),
    '路径与仓库不匹配'
  )
  check('被拒绝的目录还在', existsSync(join(docs, '.git', 'HEAD')))

  // 闸门 5（真实模式）：必须有 .git
  const noGit = join(base, 'nogit', 'Hello-World')
  mkdirSync(noGit, { recursive: true })
  await expectThrow(
    '拒绝删除没有 .git 的同名目录',
    () => local.removeClone('octocat/Hello-World', noGit),
    '不是 git 工作树'
  )
  check('被拒绝的目录还在', existsSync(noGit))

  // 正常路径：名字对、有 .git → 真的删掉
  const okDir = join(base, 'ok', 'Hello-World')
  makeWorkTree(okDir)
  const removed = await local.removeClone('octocat/Hello-World', okDir)
  check('删成功时返回实际被删的路径', removed === okDir, String(removed))
  check('目录真的没了', !existsSync(okDir))

  // 闸门 0：幂等。必须排在所有闸门最前，否则这里会撞上"不是 git 工作树"，
  // 用户就永远清不掉一条指向已删目录的脏记录。
  const second = await local.removeClone('octocat/Hello-World', okDir)
  check('目录已不存在 → 返回 null 且不抛', second === null, String(second))

  const never = await local.removeClone('octocat/Hello-World', join(base, 'never-existed'))
  check('路径从没存在过 → 同样返回 null', never === null, String(never))

  // ---------- listMissingCloneRecords：父目录启发式 ----------
  const presentDir = join(base, 'present', 'Hello-World')
  mkdirSync(presentDir, { recursive: true })
  const orphan = join(base, 'orphan', 'Hello-World') // 父目录 orphan 还在
  mkdirSync(join(base, 'orphan'), { recursive: true })
  const unmounted = join(base, 'nowhere', 'deep', 'Hello-World') // 父目录 deep 不在

  const missing = await local.listMissingCloneRecords([
    makeRepo('a/present', { cloned_path: presentDir }),
    makeRepo('a/orphan', { cloned_path: orphan }),
    makeRepo('a/unmounted', { cloned_path: unmounted }),
    makeRepo('a/none')
  ])

  check('副本还在 → 不列入', !missing.includes('a/present'), JSON.stringify(missing))
  check('副本被删、父目录还在 → 列入', missing.includes('a/orphan'), JSON.stringify(missing))
  check(
    '父目录也不在（疑似盘未挂载）→ 跳过',
    !missing.includes('a/unmounted'),
    JSON.stringify(missing)
  )
  check('没有 cloned_path 的仓库不参与对账', !missing.includes('a/none'), JSON.stringify(missing))

  finish()
}

// ============================================================
// 场景 mock：MOCK_MODE=true —— 闸门 5 换成 containment 检查，不是"跳过校验"
// ============================================================

async function runMock(): Promise<void> {
  const demoRoot = join(app.getPath('downloads'), 'StarPilotDemo')

  const inside = join(demoRoot, 'Hello-World')
  mkdirSync(inside, { recursive: true })

  // mock 的 clone 只写 README、不建 .git，所以这里能删成功本身就在证明
  // 闸门 5 走的是另一条分支，而不是被整体跳过
  const removed = await local.removeClone('octocat/Hello-World', inside)
  check('Mock 下演示目录内可以删（无 .git）', removed === inside, String(removed))
  check('演示目录内的副本真的被删了', !existsSync(inside))

  const outside = join(app.getPath('downloads'), 'Other', 'Hello-World')
  mkdirSync(outside, { recursive: true })
  await expectThrow(
    '演示目录之外一律拒绝',
    () => local.removeClone('octocat/Hello-World', outside),
    '只允许删除演示目录内的副本'
  )
  check('被拒绝的目录还在', existsSync(outside))

  await expectThrow(
    '演示目录本身也拒绝（不是"删了它下边的都行"）',
    () => local.removeClone('x/StarPilotDemo', demoRoot),
    '只允许删除演示目录内的副本'
  )
  check('演示目录本身还在', existsSync(demoRoot))

  // mock 模式一样要走 fullName 校验，不能因为"是 mock"就放行
  const wrongName = join(demoRoot, 'Something-Else')
  mkdirSync(wrongName, { recursive: true })
  await expectThrow(
    'Mock 下同样校验目录名与仓库名',
    () => local.removeClone('octocat/Hello-World', wrongName),
    '路径与仓库不匹配'
  )
  check('被拒绝的目录还在', existsSync(wrongName))

  finish()
}

// ============================================================
// 入口
// ============================================================

function main(): void {
  const scenario = process.env.SCENARIO ?? 'main'
  console.log(`== 场景：${scenario} MOCK_MODE=${process.env.MOCK_MODE} ==\n`)

  const run = scenario === 'main' ? runMain : scenario === 'mock' ? runMock : null
  if (run === null) {
    check(`未知场景 ${scenario}`, false)
    finish()
    return
  }
  void run().catch((err: unknown) => {
    console.error('自检自身出错：', err)
    process.exit(1)
  })
}

main()
