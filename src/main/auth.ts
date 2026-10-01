// 负责人：P7 ｜ GitHub OAuth Device Flow 登录
//
// 为什么是 Device Flow 而不是 Loopback Web Flow：Device Flow 不需要 client_secret
// （GitHub 官方文档原话："The client_secret is not needed for the device flow"），
// 而 Loopback 至今把 client_secret 标为 Required——那意味着要么把密钥编进应用
// （公开仓库不可接受），要么自建一个转发后端。代价只是用户多粘一次 8 位码。
//
// ⚠️ PR 1 里本文件只有骨架：所有函数抛 NOT_IMPLEMENTED，真正的状态机在 PR 2 落地。
// 之所以现在就要有它，是因为 src/main/index.ts 的 handler 要引用它才能编译；
// 这样「契约 + handler 注册」能独立编译、独立过 CI，沿用本项目 Wave 0 的既有做法。

import type { AuthState, DeviceFlowInfo, LoginOutcome } from '@shared/types'

/**
 * 当前的登录能力与进行中的设备流。渲染进程挂载时调用一次，用来决定展示
 * 哪一种 UI（不可用 / 等待中 / 未登录）。
 */
export function getState(): AuthState {
  throw new Error('NOT_IMPLEMENTED: auth.getState')
}

/**
 * 发起一次设备流。已经有一个没结束的流程时应当复用它（返回同一份 DeviceFlowInfo，
 * 不重新打开浏览器、不重启轮询），这样双击和 reload 后重点击都是幂等的。
 */
export async function startDeviceFlow(): Promise<DeviceFlowInfo> {
  throw new Error('NOT_IMPLEMENTED: auth.startDeviceFlow')
}

/**
 * 挂起等待用户在浏览器里完成授权，直到出现终态。
 * 这个 Promise 只 resolve 不 reject（取消 / 超时 / 失败都算正常结局）。
 */
export async function waitForLogin(): Promise<LoginOutcome> {
  throw new Error('NOT_IMPLEMENTED: auth.waitForLogin')
}

/** 用户主动取消。重复调用、或在流程已经进入写盘阶段时调用，都应当是无害的 no-op。 */
export function cancelDeviceFlow(): void {
  throw new Error('NOT_IMPLEMENTED: auth.cancelDeviceFlow')
}

/**
 * 进程退出前清掉挂起的定时器。
 * 骨架阶段没有任何东西要清，所以这里刻意不抛错——它挂在 app.on('before-quit') 上，
 * 在退出路径上抛异常没有任何意义，只会污染退出日志。
 */
export function dispose(): void {
  // 无悬挂定时器需要清理
}
