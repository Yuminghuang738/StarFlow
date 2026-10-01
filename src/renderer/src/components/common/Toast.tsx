import { create } from 'zustand'

export interface ToastItem {
  id: string
  type: 'success' | 'error'
  message: string
}

type PushArg = { type: 'success' | 'error'; message: string }

interface ToastStore {
  items: ToastItem[]
  push(t: PushArg): void
  remove(id: string): void
}

const AUTO_DISMISS_MS = 3000

// 模块级 store：unwrap() 要在非组件环境里 push（它不在 React 树里），
// 所以 toast 列表不能靠 React context 传递。
let seq = 0

const useToastStore = create<ToastStore>((set) => ({
  items: [],

  push(t) {
    const id = `toast-${++seq}`
    set((s) => ({ items: [...s.items, { id, ...t }] }))
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
    }, AUTO_DISMISS_MS)
  },

  remove(id) {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
  }
}))

/**
 * 非组件环境用这个（unwrap、repoStore 都走它）。
 * 为什么不让它们直接调 useToast()：react-hooks/rules-of-hooks 是纯静态规则，
 * 只看名字，见到非组件函数里出现 use* 就报错，而契约恰恰要求 useToast 能在
 * 非组件环境调用。所以拆出一个普通函数，两边行为完全一致。
 */
export function pushToast(t: PushArg): void {
  useToastStore.getState().push(t)
}

/**
 * 刻意返回模块级函数的引用，而不是 zustand 的 hook 本身：
 * hook 内部走 useSyncExternalStore，在非组件环境调用会抛 Invalid hook call。
 */
export function useToast(): { push(t: PushArg): void } {
  return { push: pushToast }
}

const TYPE_CLASS: Record<ToastItem['type'], string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white'
}

/** 只负责渲染；列表状态在模块级 store 里 */
export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const items = useToastStore((s) => s.items)
  const remove = useToastStore((s) => s.remove)

  return (
    <>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => remove(t.id)}
            className={`pointer-events-auto rounded-md px-3.5 py-2.5 text-left text-sm shadow-lg ${TYPE_CLASS[t.type]}`}
          >
            {t.message}
          </button>
        ))}
      </div>
    </>
  )
}
