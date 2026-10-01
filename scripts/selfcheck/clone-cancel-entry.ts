// local.ts「克隆中途取消」的打桩自检。
//
// 跑法：node scripts/selfcheck/clone-cancel.mjs
//   （驱动器用 esbuild 打包本文件，把 electron / simple-git 换成 scripts/selfcheck/
//     下的桩，再按 SCENARIO 起子进程。）
//
// 为什么能离开真 git 测取消：simple-git 的 abort 只是给 git 子进程发 SIGINT，
// 桩只要在收到 abort 时按真实语义 reject clone 的 promise，取消这条路径的行为
// （返回 null、清残留、删 map 条目）就完全可复现，且离线可跑。
//
// 覆盖：
//   1. 克隆途中 abort → clone() 返回 null，不是抛错；
//   2. 目标目录被 cleanupPartialClone 真清掉；
//   3. cancelClone 对没有在跑的仓库返回 false（不是错误）；
//   4. finally 把 map 条目删干净（取消之后再问还是 false）；
//   5. 非取消的失败仍然抛错，不被 signal.aborted 分支吞掉。
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

/** 跑一个应当抛错的调用，返回错误信息（成功返回空串） */
function capture(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(
    () => '',
    (err: unknown) => msgOf(err)
  )
}

/** 每个场景一个干净目录，避免残留影响"目标目录已存在"这类前置校验 */
function freshBase(tag: string): string {
  const base = join(tmpdir(), `starflow-clone-cancel-${tag}-${process.pid}`)
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base, { recursive: true })
  return base
}

/** 桩里 simpleGit() 收到的 abort 信号（local.ts 用构造期选项传给工厂） */
function lastAbortSignal(): AbortSignal | undefined {
  return (stub.lastOptions as { abort?: AbortSignal } | null)?.abort
}

// ============================================================
// 场景 main：MOCK_MODE=false —— 取消的全链路
// ============================================================

async function runMain(): Promise<void> {
  const base = freshBase('main')
  const repo = 'octocat/Hello-World'
  const target = join(base, 'Hello-World')

  // ---- 场景 3：没有在跑的克隆 → false，且不抛 ----
  check('没人跑时 cancelClone 返回 false', local.cancelClone('nobody/nothing') === false)

  // ---- 场景 1 / 2 / 4：克隆途中取消 ----
  // 桩让"git"报一行进度后挂在网络等待上，直到 abort 信号到来才 reject——
  // 与真实 simple-git 收到 SIGINT 时的行为一致。
  stub.onClone = ({ progress }) => {
    progress({ method: 'clone', stage: 'receiving', progress: 12, processed: 120, total: 1000 })
    return new Promise<void>((_resolve, reject) => {
      const signal = lastAbortSignal()
      if (!signal) {
        reject(new Error('local.ts 没把 abort 传给 simpleGit'))
        return
      }
      if (signal.aborted) {
        reject(new Error('signal is aborted without reason'))
        return
      }
      signal.addEventListener(
        'abort',
        () => reject(new Error('signal is aborted without reason')),
        { once: true }
      )
    })
  }

  const cloning = local.clone(repo, base)
  await sleep(50)

  // 桩照 git 语义建出了目标目录，所以"取消后它被清掉"才是 cleanupPartialClone 跑过的证据
  check('克隆途中目标目录已建出', existsSync(target), target)
  check('abort 通过构造期选项传给了 simpleGit', lastAbortSignal() instanceof AbortSignal)
  check('取消前 signal 未 aborted', lastAbortSignal()?.aborted === false)

  const cancelled = local.cancelClone(repo)
  check('正在跑 → cancelClone 返回 true', cancelled === true)
  check('cancelClone 后 signal 已 aborted', lastAbortSignal()?.aborted === true)

  const result = await cloning
  check('取消 → clone() 返回 null 而不是抛错', result === null, String(result))
  check('残留目录被 cleanupPartialClone 清掉', !existsSync(target), target)
  // 场景 4：finally 删掉了 map 条目，所以再问一次必须是 false
  check('取消后再 cancelClone 返回 false（map 条目已删）', local.cancelClone(repo) === false)

  // ---- 取消后立刻重新克隆同一个仓库：目录已被清理，不该撞上"目标目录已存在" ----
  stub.onClone = async ({ progress }) => {
    progress({ method: 'clone', stage: 'receiving', progress: 100, processed: 10, total: 10 })
  }
  const again = await local.clone(repo, base)
  check('取消后可立刻重新 clone 同一仓库', again === target, String(again))
  check('重新 clone 后目标目录回来', existsSync(target))
  check('成功后 cancelClone 仍返回 false（finally 清干净）', local.cancelClone(repo) === false)

  // ---- 场景 5：非取消的失败仍然抛错，不能被 signal.aborted 分支吞掉 ----
  stub.onClone = async ({ progress }) => {
    progress({ method: 'clone', stage: 'receiving', progress: 30, processed: 300, total: 1000 })
    throw new Error('fatal: unable to access https://github.com/foo/Bar.git')
  }
  const failed = await capture(() => local.clone('foo/Bar', base))
  check('非取消失败仍然抛错（带中文前缀）', failed.includes('克隆失败：'), failed)
  check('失败信息带原始 git 报错', failed.includes('unable to access'), failed)
  check('失败后 cancelClone 返回 false（map 已清）', local.cancelClone('foo/Bar') === false)

  finish()
}

// ============================================================
// 场景 mock：MOCK_MODE=true —— 撤销信号不参与，且不造假
// ============================================================

async function runMock(): Promise<void> {
  const base = freshBase('mock')
  const repo = 'octocat/Hello-World'

  check('Mock 下没在跑 → cancelClone 返回 false', local.cancelClone(repo) === false)

  const path = await local.clone(repo, base)
  check('Mock 下 clone 仍返回目录（签名放宽后语义不变）', path === join(base, 'Hello-World'), String(path))
  check('Mock 下 simpleGit 一次都没被调用', stub.cloneCalls.length === 0, String(stub.cloneCalls.length))
  // Mock 下压根没有 AbortController 记录，取消一律 false——不是"没实现"，是"没人在跑"
  check('Mock 下 clone 完成后 cancelClone 仍为 false', local.cancelClone(repo) === false)

  finish()
}

// ============================================================
// 入口
// ============================================================

function main(): void {
  const scenario = process.env.SCENARIO ?? 'main'
  console.log(`== 场景：${scenario} MOCK_MODE=${process.env.MOCK_MODE} ==\n`)

  const run =
    scenario === 'main' ? runMain : scenario === 'mock' ? runMock : null
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
