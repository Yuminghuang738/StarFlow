/**
 * 表单控件的公共外观。
 *
 * 抽出来是因为原先这段类名在设置页手抄了 4 遍、FilterBar 里还有第 5 遍——
 * 改一次边框色要改五处，漏一处就是两套观感。
 *
 * 注意基础态是 `border-border`、悬停才升到 `border-strong`：
 * 两个都写 strong 的话悬停反馈会整个消失（同色 = 没变化）。
 */
export const FIELD_BASE =
  'border border-border bg-surface text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50'

export type FieldSize = 'sm' | 'md'

export const FIELD_SIZE: Record<FieldSize, string> = {
  sm: 'rounded-lg px-2.5 py-1.5 text-sm',
  md: 'rounded-lg px-3 py-2 text-sm'
}
