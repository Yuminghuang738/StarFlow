// 主进程 console 的展示用环状缓冲。
//
// 存在的理由：界面要有一栏「运行日志」给排查问题用，而 Electron 主进程的 console
// 默认只写到启动它的终端——用户双击图标启动时根本没有终端可看。这里把 console 的
// 输出复制一份留在内存里，界面轮询取走。
//
// ⚠️ 三条边界（改这个文件前先读）：
//   1. **只镜像，不接管**。包装后的函数先记缓冲、再原样调用原始实现，终端里看到的东西
//      必须逐字不变。这个模块坏掉不能把应用/别人的日志一起弄坏。
//   2. **只收主进程**。渲染进程的 console 有自己的开发者工具，跨进程收过来既没有通道
//      （本项目只有 invoke、没有 main→renderer 推送）也没必要。
//   3. **被挤掉的条数如实报**。getLogSnapshot 的 dropped 要原样交给界面显示
//      「已丢弃 N 条」——悄悄吞掉会让"日志看起来是连续的"变成一句谎。

import { inspect } from 'node:util'
import type { LogEntry, LogSnapshot } from '@shared/types'

/** 缓冲上限。500 条足够看清一次操作用户遇到的来龙去脉，再多也只是占内存。 */
export const LOG_BUFFER_LIMIT = 500

/** 已经装过一次就不要再套一层。热重载 / 别的模块重复调用都会走到这里 */
let installed = false

/**
 * 环状缓冲本体。用数组 + 超限时 shift，而不是预分配下标数组：
 * 上限 500、每次 shift 的最坏代价可以忽略，换来 getLogSnapshot 天然按时间正序，
 * 不用在下标环上做两段拼接（那正是这类代码最容易写出顺序 bug 的地方）。
 */
const entries: LogEntry[] = []

/** 本会话累计写入数（含被挤掉的）。**clearLogs 不重置它**，见下面对 seq 的说明 */
let total = 0

/** 因超出上限被挤掉的条数 */
let dropped = 0

/**
 * 本会话单调递增的序号。
 *
 * 刻意**不随 clearLogs 归零**：契约说 seq 是"本会话内单调递增"、渲染进程靠它判断
 * "有没有新条目"。清空后再从头开始，界面上的旧 seq 会和新 seq 撞上，去重逻辑就会
 * 把刚来的新日志当旧的丢掉。
 */
let nextSeq = 1

/**
 * 脱敏。这是"把日志端到界面"最容易闯的祸：主进程的日志里会带上 GitHub Token
 * （`ghp_…` / `github_pat_…`）和 AI Key（`sk-…`），而这一栏是要展示、要能被复制走的。
 *
 * 一条正则覆盖三种前缀，整体替换成 `***`，宁可多抹一点也不漏。**只替换 token 片段，
 * 不动其余文字**，所以消息仍然可读。`github_pat_` 与 `ghp_` 无前缀包含关系，
 * 交替分支按书写顺序匹配即可。
 */
const SECRET_RE = /(ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)/g

function redact(text: string): string {
  return text.replace(SECRET_RE, '***')
}

/** 消息开头的 `[main]` / `[local]` / `[ai]` 这类来源标记。解析不出就是 null */
const SCOPE_RE = /^\[([^\]]+)\]/

/**
 * 把一次 console 调用的参数拼成一行可读文本。
 *
 * 非字符串用 util.inspect：对象的默认 `[object Object]` 对排查毫无用处，
 * 而 console 自己的格式化又只发生在原始实现里（我们拿不到格式化后的文本）。
 * 多参数用空格连接，与终端里的观感一致。
 */
function formatArgs(args: readonly unknown[]): string {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 4, colors: false })))
    .join(' ')
}

/** 记一条。**只用数组操作，绝不调 console**——否则包装器会调回自己，无限递归 */
function record(level: LogEntry['level'], args: readonly unknown[]): void {
  let message = formatArgs(args)
  message = redact(message)
  const scope = SCOPE_RE.exec(message)?.[1] ?? null

  entries.push({ seq: nextSeq, level, at: new Date().toISOString(), scope, message })
  nextSeq += 1
  total += 1

  while (entries.length > LOG_BUFFER_LIMIT) {
    entries.shift()
    dropped += 1
  }
}

/**
 * 装上捕获。**幂等**：重复调用只装一次（热重载、或别的模块也想确保已装时都会再调）。
 *
 * 每个包装器都先记缓冲、再委托给原始实现，且记录这一步包在 try/catch 里：
 * 采集失败绝不能连累日志本身——终端里那句输出比界面上的这一栏重要得多。
 * 原始实现用 `console` 作为 this（.bind(console) 捕获），避免依赖调用方的 this。
 */
export function installLogCapture(): void {
  if (installed) return
  installed = true

  const originals = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  } as const

  console.log = ((...args: unknown[]): void => {
    try {
      record('log', args)
    } catch {
      // 采集失败（内存、序列化……）只跳过这一条缓冲，原始输出照旧
    }
    originals.log(...args)
  }) as typeof console.log

  console.info = ((...args: unknown[]): void => {
    try {
      record('info', args)
    } catch {
      /* 同上 */
    }
    originals.info(...args)
  }) as typeof console.info

  console.warn = ((...args: unknown[]): void => {
    try {
      record('warn', args)
    } catch {
      /* 同上 */
    }
    originals.warn(...args)
  }) as typeof console.warn

  console.error = ((...args: unknown[]): void => {
    try {
      record('error', args)
    } catch {
      /* 同上 */
    }
    originals.error(...args)
  }) as typeof console.error
}

/**
 * 取一份快照交给界面。entries 已经是时间正序（record 里就是 push 进数组尾部）。
 *
 * 返回数组的浅拷贝：调用方拿到后不会再被后续 record 悄悄改变内容，
 * 但每条 LogEntry 本身是不可变的（只在 record 里新建一次），不需要深拷。
 */
export function getLogSnapshot(): LogSnapshot {
  return { entries: entries.slice(), total, dropped }
}

/**
 * 清空缓冲。**total / dropped 一起归零**（界面上的「共 N 条 / 已丢弃 N 条」要能重置），
 * 但**不动 nextSeq**（见上面 seq 的说明）。
 */
export function clearLogs(): void {
  entries.length = 0
  total = 0
  dropped = 0
}
