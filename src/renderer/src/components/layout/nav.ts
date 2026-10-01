/**
 * 侧边栏导航表。
 *
 * 单独放一个模块是为了切断 AppShell ↔ Sidebar 的循环 import：
 * 两边都要用 AppTab 和这份清单，谁定义都会绕回去。
 */

export type AppTab = 'recommend' | 'overview' | 'manage' | 'similar' | 'report' | 'settings'

export interface NavItem {
  key: AppTab
  label: string
  /** 悬停时的 tooltip，一句话说清这个板块是干什么的 */
  hint: string
}

/** 顺序即界面顺序，与需求里列出的板块顺序一致 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'recommend', label: '仓库推荐', hint: '说一句话，找出符合条件的仓库' },
  { key: 'overview', label: 'Star 总览', hint: 'Star 仓库的统计与图表' },
  { key: 'manage', label: 'Star 管理', hint: '筛选、Fork、Clone 所有 Star 仓库' },
  { key: 'similar', label: '猜你喜欢', hint: '根据已 Star 的仓库推荐相似的' },
  { key: 'report', label: '周报', hint: '本周 Star 动态与 AI 总结' },
  { key: 'settings', label: '设置', hint: '主题、GitHub Token、AI 配置' }
]
