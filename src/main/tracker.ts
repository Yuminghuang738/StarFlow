// 负责人：P4 ｜ 接口规格见 docs/module-signatures.md（冻结），任务说明见 prompts/
// mock 下真的用 node-cron 起一个任务，但任务体里只打日志。

import cron, { type ScheduledTask } from 'node-cron'
import { isMockMode } from './config'

let task: ScheduledTask | null = null

// 演示用间隔（每 5 分钟），方便现场看到 tick；P4 接手后按业务需要改成每日跑的表达式
const MOCK_CRON = '*/5 * * * *'

export function start(): void {
  if (!isMockMode()) {
    throw new Error('NOT_IMPLEMENTED: tracker.start')
  }
  // 幂等：已经启动就直接返回，不要起两个任务
  if (task) return
  task = cron.schedule(MOCK_CRON, () => {
    console.log('[tracker] mock tick')
  })
}

export function stop(): void {
  if (!isMockMode()) {
    throw new Error('NOT_IMPLEMENTED: tracker.stop')
  }
  if (!task) return
  void task.destroy()
  task = null
}
