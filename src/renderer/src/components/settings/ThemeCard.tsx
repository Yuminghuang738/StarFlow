import { useState } from 'react'
import { Card } from '../common/Card'
import { applyTheme, useTheme, type ThemeChoice } from '../../lib/theme'

/**
 * 主题选择器。
 *
 * 立即生效、无需保存按钮：主题是纯前端偏好，写进 localStorage 就完事，
 * 走一次"保存/取消"反而是多余的仪式感。
 *
 * `resolved`（实际生效的明暗）只在选了「跟随系统」时才有额外信息量，所以那句话
 * 也只在那个分支下显示。
 */

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
  { value: 'system', label: '跟随系统' }
]

/**
 * 选项左侧那个小圆点是这个主题的**缩略图**，所以它必须固定显示该主题的颜色、
 * **不能**跟着当前主题走——用 `bg-bg` / `dark:` 变体都会让它失去意义。
 * 这也是这里唯一允许出现裸色值的地方：三个渐变端点是 index.css 里
 * `--c-bg` / `--c-grad-*` 的手抄，改配色时要一起改。
 */
const SWATCH: Record<ThemeChoice, string> = {
  light: 'linear-gradient(135deg, #eef2ff, #ffffff)',
  dark: 'linear-gradient(135deg, #110e2d, #020617)',
  system: 'linear-gradient(135deg, #eef2ff 0 50%, #110e2d 50% 100%)'
}

const RESOLVED_LABEL = { light: '亮色', dark: '暗色' } as const

/** 根 Card 不带 mt：与上方区块的间距由设置页的 PageContainer 统一给（见 PageLayout.tsx） */
export function ThemeCard(): React.JSX.Element {
  const { choice, resolved } = useTheme()
  /**
   * 这一次的选择**没能写进本机存储**（存储被禁用 / 配额满）。
   *
   * 为什么不静默：上面那句「并记住你的选择——下次启动会在界面出现之前就应用好」
   * 是一句承诺，而这时候它是假的。主题确实切了（本次会话完全正常），坏掉的只是
   * "下次还记得"——所以不能整个报成失败，也不能什么都不说。每次点击都用返回值的
   * 真假覆盖它，写成功了这条提示自己就消失了。
   */
  const [rememberFailed, setRememberFailed] = useState(false)

  return (
    <Card>
      <h2 className="text-sm font-medium text-fg">外观</h2>
      <p className="mt-1 text-xs text-fg-subtle">
        选择立即生效，并记住你的选择——下次启动会在界面出现之前就应用好，不会先闪一下另一个主题。
      </p>

      <div
        role="radiogroup"
        aria-label="主题"
        className="mt-3 flex flex-wrap gap-2"
      >
        {OPTIONS.map((opt) => {
          const active = choice === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setRememberFailed(!applyTheme(opt.value))}
              className={[
                'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'border-border bg-surface/40 text-fg-muted hover:bg-surface-2 hover:text-fg'
              ].join(' ')}
            >
              <span
                aria-hidden
                className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                style={{ backgroundImage: SWATCH[opt.value] }}
              />
              {opt.label}
            </button>
          )
        })}
      </div>

      {rememberFailed ? (
        <p className="mt-2 text-xs text-warning">
          主题已经切换，但这一次没能把它记到本机（存储被禁用或写不进去）。
          重启后会回到上一次成功保存的那个主题——这是本机存储的限制，不是选择没生效。
        </p>
      ) : null}

      {choice === 'system' ? (
        <p className="mt-2 text-xs text-fg-subtle">当前系统为{RESOLVED_LABEL[resolved]}，主题会跟着它变。</p>
      ) : null}
    </Card>
  )
}
