// local.ts 克隆进度的打桩自检。
//
// 跑法：node scripts/selfcheck/clone-progress.mjs
//   （驱动器用 esbuild 打包本文件，把 electron 和 simple-git 都换成
//     scripts/selfcheck/ 下的桩，再按 SCENARIO 起子进程。）
//
// 被验证的核心是**主进程侧的进度状态机**：什么时候有记录、记录里放什么、
// 记录什么时候该消失。git 本身吐不吐进度在这层是假的（见 simple-git-stub.mjs），
// 真机上的百分比要靠人工验收。
//
// 本自检不接入 CI，与其它自检一致。
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as local from '../../src/main/local'
import { stub } from './simple-git-stub.mjs'

let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

function finish(): void {
  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function msgOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 每个场景一个干净目录，避免上一轮的残留影响"目标目录已存在"这类断言 */
function freshBase(tag: string): string {
  const base = join(tmpdir(), `starpilot-clone-progress-${tag}-${process.pid}`)
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base, { recursive: true })
  return base
}

function capture(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(
    () => '',
    (err: unknown) => msgOf(err)
  )
}

// ============================================================
// 场景 main：MOCK_MODE=false，完整的进度生命周期
// ============================================================

async function runMain(): Promise<void> {
  const base = freshBase('main')
  const repo = 'octocat/Hello-World'
  const target = join(base, 'Hello-World')

  // ---- 从没克隆过：返回 null，渲染进程据此不画进度条 ----
  check('没克隆过时返回 null', local.getCloneProgress(repo) === null, String(local.getCloneProgress(repo)))

  // ---- 让"git"报一行 receiving 然后卡住，模拟大仓库正在下载 ----
  // emit 单独存出来：要在 gate 之外再补一行进度（真实 git 收尾时会报 100%）
  let emit: (e: Record<string, unknown>) => void = () => {}
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  stub.onClone = async ({ progress }) => {
    emit = (e) => progress(e)
    progress({ method: 'clone', stage: 'receiving', progress: 47, processed: 1234, total: 2624 })
    await gate
  }

  const cloning = local.clone(repo, base)
  await sleep(50)

  const mid = local.getCloneProgress(repo)
  check('克隆中出现进度记录', mid !== null, JSON.stringify(mid))
  check('阶段名原样透传', mid?.stage === 'receiving', String(mid?.stage))
  check('百分比原样透传', mid?.percent === 47, String(mid?.percent))
  check('对象数原样透传', mid?.processed === 1234 && mid?.total === 2624, `${mid?.processed}/${mid?.total}`)
  check(
    'git 确实收到了 https 形式的 URL',
    stub.cloneCalls.at(-1)?.url === 'https://github.com/octocat/Hello-World.git',
    String(stub.cloneCalls.at(-1)?.url)
  )
  check('local.ts 把 progress 回调传给了 simpleGit', typeof stub.lastOptions?.progress === 'function')

  // ---- 关键断言：git 卡住不报进度时，elapsedMs 仍要往前走 ----
  // 这是"读取时现算"而不是"写进度时算好存下来"的直接证据。
  // 反过来写（写死）的话，counting / resolving 阶段 git 十几秒不吭声，
  // 界面上的秒数就会冻住——那恰恰是这个进度条要解决的问题。
  const before = local.getCloneProgress(repo)?.elapsedMs ?? 0
  await sleep(250)
  const after = local.getCloneProgress(repo)?.elapsedMs ?? 0
  check('git 不报进度时 elapsedMs 仍在增长', after - before >= 200, `${before}ms -> ${after}ms`)
  check('这段时间里阶段没被改掉', local.getCloneProgress(repo)?.stage === 'receiving')

  emit({ method: 'clone', stage: 'receiving', progress: 100, processed: 2624, total: 2624 })
  release()
  const path = await cloning

  check('克隆返回完整目标路径', path === target, path)
  check('目标目录被建出来了', existsSync(target))
  // 刻意不删记录：删了的话，渲染进程在 invoke 返回之前的最后一次轮询会读到
  // null，进度条会闪回"还没开始"
  check('克隆结束后记录仍在，不闪回 null', local.getCloneProgress(repo) !== null)
  check('记录停在最后一次上报的值', local.getCloneProgress(repo)?.percent === 100, String(local.getCloneProgress(repo)?.percent))

  // ---- 前置校验失败：抛得早，且不该留下进度记录 ----
  const missing = await capture(() => local.clone('foo/bar', join(base, '不存在的目录')))
  check('所选目录不存在 → 中文错误', missing.includes('所选目录不存在'), missing)
  check('所选目录不存在 → 没有留下进度记录', local.getCloneProgress('foo/bar') === null)

  mkdirSync(join(base, 'Baz'), { recursive: true })
  const dup = await capture(() => local.clone('foo/Baz', base))
  check('目标目录已存在 → 中文错误', dup.includes('目标目录已存在'), dup)
  check('目标目录已存在 → 没有留下进度记录', local.getCloneProgress('foo/Baz') === null)

  // ---- 克隆中途失败：记录停在失败那一刻，日志和界面能看出死在哪一步 ----
  stub.onClone = async ({ progress }) => {
    progress({ method: 'clone', stage: 'receiving', progress: 30, processed: 300, total: 1000 })
    throw new Error('fatal: unable to access https://github.com/foo/Bar.git')
  }
  const failed = await capture(() => local.clone('foo/Bar', base))
  check('克隆失败 → 带中文前缀的错误', failed.includes('克隆失败：'), failed)
  check('克隆失败 → 原始 git 报错被带上', failed.includes('unable to access'), failed)
  check('克隆失败 → 记录停在最后上报的阶段', local.getCloneProgress('foo/Bar')?.stage === 'receiving')

  // ---- 两个仓库同时克隆：进度必须各归各的 ----
  // 「key 用 full_name 而不是一个模块级变量」这个决定的直接理由
  const gates: Record<string, () => void> = {}
  stub.onClone = ({ progress, url }) => {
    const which = url.includes('RepoA') ? 'A' : 'B'
    progress({
      method: 'clone',
      stage: 'receiving',
      progress: which === 'A' ? 11 : 88,
      processed: 1,
      total: 2
    })
    return new Promise<void>((resolve) => {
      gates[which] = resolve
    })
  }
  const a = local.clone('u/RepoA', base)
  const b = local.clone('u/RepoB', base)
  await sleep(50)
  check(
    '并发克隆时两份进度互不覆盖',
    local.getCloneProgress('u/RepoA')?.percent === 11 && local.getCloneProgress('u/RepoB')?.percent === 88,
    `A=${local.getCloneProgress('u/RepoA')?.percent} B=${local.getCloneProgress('u/RepoB')?.percent}`
  )
  gates.A()
  gates.B()
  await Promise.all([a, b])

  finish()
}

// ============================================================
// 场景 mock：MOCK_MODE=true
// ============================================================

async function runMock(): Promise<void> {
  const base = freshBase('mock')

  const path = await local.clone('octocat/Hello-World', base)
  check('Mock 下 clone 仍然返回目录', path === join(base, 'Hello-World'), path)
  check('Mock 下真的写了 README（让"打开目录"有东西可看）', existsSync(join(path, 'README.md')))

  // 项目铁律：全项目只有 mock.ts 一个假数据源。在 local.ts 里造一套假进度
  // 就是第二个假数据源，所以 Mock 下宁可不显示进度条。
  check('Mock 下不产生进度记录', local.getCloneProgress('octocat/Hello-World') === null)
  check('Mock 下 simpleGit 一次都没被调用', stub.cloneCalls.length === 0, String(stub.cloneCalls.length))

  finish()
}

// ============================================================
// 入口
// ============================================================

function main(): void {
  const scenario = process.env.SCENARIO ?? 'main'
  console.log(`== 场景：${scenario} MOCK_MODE=${process.env.MOCK_MODE} ==\n`)

  if (scenario === 'main') {
    void runMain().catch((err: unknown) => {
      console.error('自检自身出错：', err)
      process.exit(1)
    })
    return
  }
  if (scenario === 'mock') {
    void runMock().catch((err: unknown) => {
      console.error('自检自身出错：', err)
      process.exit(1)
    })
    return
  }
  check(`未知场景 ${scenario}`, false)
  finish()
}

main()
