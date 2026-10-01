// 自检脚手架：把 simple-git 打桩。
//
// 为什么不直接跑真的 git clone：
//   1. 要联网，而本项目的自检一律离线可跑；
//   2. 小仓库（octocat/Hello-World）几百毫秒就结束，往往一行进度都来不及吐，
//      断言不到任何百分比；大仓库又会把自检拖到几分钟，同样不可靠；
//   3. 更要紧的是，失败路径（克隆中途断网）根本没法稳定复现。
// 打桩之后「git 什么时候吐进度、吐什么、什么时候失败」完全由场景脚本决定。
//
// local.ts 只用到两样东西：simpleGit(options) 工厂，和返回对象上的 .clone(url, target)。
// 这里就只实现这两样。.cwd / .env / 回调式 API 一概不做——真要用到了，
// 先想清楚是不是把被测代码写复杂了。
import { mkdirSync } from 'node:fs'

export const stub = {
  /** 每次 clone 的入参，供断言 URL 拼得对不对 */
  cloneCalls: [],
  /** simpleGit() 收到的 options，供断言 local.ts 确实传了 progress */
  lastOptions: null,
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
  return {
    clone(url, target) {
      stub.cloneCalls.push({ url, target })
      // 真实 git clone 会自己建出目标目录，桩必须照做，
      // 否则被测代码里"克隆完目录就该在"的语义就没了
      mkdirSync(target, { recursive: true })
      return stub.onClone({ progress: options.progress, url, target })
    }
  }
}
