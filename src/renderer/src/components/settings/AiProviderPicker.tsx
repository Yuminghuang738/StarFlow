import { AI_PRESETS, matchPreset } from '@shared/ai-providers'
import type { AiPreset } from '@shared/ai-providers'
import { cn } from '../../lib/cn'

/**
 * 服务商预设选择器。
 *
 * 点一下就把 Base URL 和模型名一起填好——**模型名是关键的一半**：只填地址不填模型的话，
 * 请求会带着上一个端点的模型名打过去，换回一个用户从没输入过的名字的 404。
 *
 * 当前生效的预设由 `matchPreset(baseUrl)` **推导**而不是记一个 id：用户手打一个
 * DeepSeek 地址时也该高亮，记 id 就漏了这种情况。
 */
export function AiProviderPicker({
  baseUrl,
  onPick
}: {
  baseUrl: string
  onPick: (preset: AiPreset) => void
}): React.JSX.Element {
  const active = matchPreset(baseUrl)

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {AI_PRESETS.map((preset) => {
          const selected = active?.id === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPick(preset)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                selected
                  ? 'border-primary/40 bg-primary/15 font-medium text-primary'
                  : 'border-border bg-surface-2 text-fg-muted hover:border-border-strong hover:text-fg'
              )}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      {/* 只有选了带说明的预设（目前是两个本地端点）时才占这一行 */}
      {active?.note ? <p className="mt-1.5 text-xs text-fg-subtle">{active.note}</p> : null}
    </div>
  )
}
