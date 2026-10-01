/**
 * 板块跳转的上下文。
 *
 * 为什么需要它：总览页上「可能已停更 12」这类数字，用户看到的第一反应是
 * "哪 12 个"。要回答这个问题就得跳到收藏管理页、并把对应的筛选也带过去，
 * 而 App.tsx 里 PAGES 是按 `{ key, render }` 渲染的、页面不收 props
 * （页面能保活正是靠这个结构，不能为了传个回调把它改掉）。
 *
 * 用一个只有 `goTo` 的上下文，而不是把 tab 状态搬进 zustand：tab 与 visited
 * 是一对必须同步更新的本地状态（见 App.tsx 的说明），拆到 store 里反而更容易
 * 出现两者不一致。上下文只往外暴露"跳过去"这一个动作，谁持有状态不关调用方的事。
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AppTab } from './nav'

interface NavContextValue {
  goTo(tab: AppTab): void
}

const NavContext = createContext<NavContextValue | null>(null)

export function NavProvider({
  goTo,
  children
}: {
  goTo(tab: AppTab): void
  children: ReactNode
}): React.JSX.Element {
  // goTo 是 useState 的 setter（引用本来就稳定），这里仍是应尽的义务：
  // 上下文的值一旦每次渲染都换新对象，所有消费者都会跟着重渲染。
  const value = useMemo(() => ({ goTo }), [goTo])
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

/**
 * 只在 NavProvider 内部可用。取不到就抛错而不是返回空实现——
 * 静默失败的按钮（点了没反应、也不报错）是最难查的一类问题。
 */
export function useNav(): NavContextValue {
  const ctx = useContext(NavContext)
  if (ctx === null) {
    throw new Error('useNav 必须在 NavProvider 内部使用（页面由 App.tsx 统一渲染，正常不会走到这里）')
  }
  return ctx
}
