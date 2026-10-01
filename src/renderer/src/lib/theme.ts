import { useSyncExternalStore } from 'react'

/**
 * 主题运行时。
 *
 * 真相来源是 **localStorage**，不是 zustand、不是主进程的 lowdb。原因见
 * index.html 里那段防闪脚本的注释：主题必须在**第一次绘制之前**确定，
 * 而任何异步往返（IPC 读 lowdb）都必然先渲染默认主题再翻面，那一下闪白
 * 是没法靠 CSS 遮住的。所以这里刻意不用 persist 中间件——多一份状态就多一处
 * 可能与 localStorage 不一致的地方。
 *
 * 模块加载时就把 state 初始化好，并在首次 subscribe 时把 DOM 校一遍，
 * 防止防闪脚本因为 localStorage 被禁用而没跑成。
 */

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'starflow:theme'

/** 默认亮色。index.html 的防闪脚本里有一份同样的默认值，改这里要同步改那边。 */
const DEFAULT_THEME: ThemeChoice = 'light'

const CHOICES: readonly string[] = ['light', 'dark', 'system']

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && CHOICES.includes(value)
}

export interface ThemeState {
  /** 用户的选择，含 'system' */
  choice: ThemeChoice
  /** 实际生效的明暗，'system' 已被解析掉 */
  resolved: ResolvedTheme
}

// ---------------------------------------------------------------------------
// localStorage（全部 try/catch：隐私设置 / 存储被禁用时访问会直接抛）
// ---------------------------------------------------------------------------

export function readStoredTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeChoice(raw) ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function persistTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // 写不进去也不影响本次会话：state 已经更新，只是下次启动会回到默认。
  }
}

// ---------------------------------------------------------------------------
// 系统偏好
// ---------------------------------------------------------------------------

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return prefersDark() ? 'dark' : 'light'
  return choice
}

// ---------------------------------------------------------------------------
// 状态与订阅
// ---------------------------------------------------------------------------

function initialState(): ThemeState {
  const choice = readStoredTheme()
  return { choice, resolved: resolveTheme(choice) }
}

let state: ThemeState = initialState()
const listeners = new Set<() => void>()

const SWITCH_CLASS = 'theme-switching'

// 快速连点主题按钮时会有多个 rAF 链在飞，用 token 保证只有最后一条能摘掉抑制类，
// 否则先发起的那条会在中途解除，切到一半的元素就开始各自过渡了。
let switchToken = 0

/**
 * 把 resolved 写到 `<html>` 上。亮色 = 没有 .dark 类，所以这里只 toggle 不加 light 类
 * （index.html 的防闪脚本也只加 .dark，两边必须一致）。
 */
function paint(resolved: ResolvedTheme): void {
  const root = document.documentElement
  if (root.classList.contains('dark') === (resolved === 'dark')) return

  const token = ++switchToken
  // 切换期间冻结所有过渡，避免每个元素各自 200ms 淡过去、看起来像是没对齐。
  root.classList.add(SWITCH_CLASS)
  root.classList.toggle('dark', resolved === 'dark')

  // 两帧：一帧不够，Chromium 可能把样式重算合并到下一帧，那时抑制类已经摘掉了。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token === switchToken) root.classList.remove(SWITCH_CLASS)
    })
  })
}

function commit(choice: ThemeChoice): void {
  const resolved = resolveTheme(choice)
  // 先画 DOM 再发通知：React 重渲染后的 useEffect 里会读 getComputedStyle 取图表色板，
  // 顺序反了就会拿到旧主题的值（图表要等下一次切换才变色）。
  paint(resolved)
  if (choice === state.choice && resolved === state.resolved) return
  state = { choice, resolved }
  for (const listener of listeners) listener()
}

/** 设置主题：写 localStorage + 立即生效。这是唯一的写入口。 */
export function applyTheme(choice: ThemeChoice): void {
  persistTheme(choice)
  commit(choice)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ThemeState {
  return state
}

// 模块加载时对一次账：正常情况下防闪脚本已经做完了，这里是 localStorage 不可用时的兜底。
paint(state.resolved)

// 只在用户选了 'system' 时才响应系统切换。这里**不能**重新读 localStorage——
// 存储不可用时会读回默认值，把用户刚选的 'system' 冲掉。
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.choice === 'system') commit('system')
  })
} catch {
  // 没有 matchMedia（或 addEventListener 的旧签名）：跟随系统就等于永远跟随初始值。
}

/**
 * 订阅主题。返回的 `state` 是模块级对象，引用稳定——可以安全地放进依赖数组。
 * 第三个参数（server snapshot）是 client-only 应用用不到的，但传上更保险，
 * 免得以后有人加了 SSR 之后在 hydration 处炸掉。
 */
export function useTheme(): ThemeState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
