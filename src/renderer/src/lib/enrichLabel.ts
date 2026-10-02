import type { AiEnrichProgress } from '@shared/types'

/**
 * 「AI 补全分类」按钮在跑的时候显示什么。
 *
 * 单独放一个模块而不是在 Manage / Settings 各写一遍：这是**一句给用户看的话**，
 * 两处措辞必须一致（同一个功能在两个页面上叫两个名字，用户会以为它们是两件事）。
 *
 * 三条刻意的取舍：
 *   · 总数未知（`total === 0`，主进程还没开始记录）时只说「补全中…」——
 *     不拿 0 冒充进度，也不显示 "0/0" 这种看着像"跑完了"的东西；
 *   · `null`（没有一批在跑）不该走到这里，但真走到了也返回「补全中…」：
 *     调用方只在明确"正在跑"时才用它，这里给的是最不撒谎的那个兜底；
 *   · 不显示百分比。done/total 是我们真实知道的两个数，百分比是它的派生品，
 *     多一层换算只会多一处能算错的地方（比如 total 变成 0 时除零）。
 */
export function enrichButtonLabel(progress: AiEnrichProgress | null): string {
  if (progress === null || progress.total === 0) return '补全中…'
  return `补全中 ${progress.done}/${progress.total}`
}
