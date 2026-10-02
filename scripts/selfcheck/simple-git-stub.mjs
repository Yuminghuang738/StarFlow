// 自检脚手架：把 simple-git 打桩。
//
// 为什么不直接跑真的 git clone：
//   1. 要联网，而本项目的自检一律离线可跑；
//   2. 小仓库（octocat/Hello-World）几百毫秒就结束，往往一行进度都来不及吐，
//      断言不到任何百分比；大仓库又会把自检拖到几分钟，同样不可靠；
//   3. 更要紧的是，失败路径（克隆中途断网）根本没法稳定复现。
// 打桩之后「git 什么时候吐进度、吐什么、什么时候失败」完全由场景脚本决定。
//
// local.ts 用到三样东西：simpleGit(options) 工厂，和返回对象上的 .clone(url, target)
// 与 .raw(args)。这里就只实现这三样。.cwd / .env / 回调式 API 一概不做——
// 真要用到了，先想清楚是不是把被测代码写复杂了。
import { mkdirSync } from 'node:fs'

export const stub = {
  /** 每次 clone 的入参，供断言 URL 拼得对不对 */
  cloneCalls: [],
  /** 每次 raw 的入参，顺序即真实调用顺序（供断言 fetch / merge 的先后与有无） */
  rawCalls: [],
  /** simpleGit() 收到的 options，供断言 local.ts 确实传了 progress */
  lastOptions: null,
  /** simpleGit() 最近一次收到的 baseDir：断言"命令打在了正确的目录上" */
  lastBaseDir: null,
  /**
   * 由场景替换，签名 ({ baseDir, args }) => string | Promise<string>。
   * 桩**不给默认实现**：没准备却收到命令就直接报错（见 raw 里那句 reject），
   * 免得被测代码多打了一条命令而自检毫无察觉——"多打一条 fetch"正是本功能
   * 最要盯的浪费。
   */
  onRaw: null,
  /**
   * 由场景替换，签名 ({ progress, url, target }) => Promise<void>。
   * 场景在这里调用 progress({...}) 来"伪造" git 吐出来的进度行。
   */
  onClone: async ({ progress }) => {
    progress?.({ method: 'clone', stage: 'receiving', progress: 100, processed: 1, total: 1 })
  }
}

export function simpleGit(options = {}) {
  stub.lastOptions = options
  stub.lastBaseDir = options.baseDir ?? null
  return {
    clone(url, target) {
      stub.cloneCalls.push({ url, target })
      // 真实 git clone 会自己建出目标目录，桩必须照做，
      // 否则被测代码里"克隆完目录就该在"的语义就没了
      mkdirSync(target, { recursive: true })
      return stub.onClone({ progress: options.progress, url, target })
    },
    raw(args) {
      const baseDir = options.baseDir ?? null
      stub.lastBaseDir = baseDir
      stub.rawCalls.push({ baseDir, args })
      if (typeof stub.onRaw !== 'function') {
        return Promise.reject(
          new Error(`simple-git 桩没有准备这个命令：git ${args.join(' ')}`)
        )
      }
      // Promise.resolve 包一层：场景既能同步返回字符串，也能 return 一个 Promise
      // （并发场景要靠它把调用"挂住"来观察同时在飞的数量）
      return Promise.resolve().then(() => stub.onRaw({ baseDir, args }))
    }
  }
}
