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

/**
 * 顺序即界面顺序，与需求里列出的板块顺序一致。
 *
 * 命名规则：一律纯中文、尽量四字、每一条都回答「在这里做什么」。
 * 刻意避开「Star 总览 / Star 管理」那种中英混排（其余板块都是纯中文，混在一起不齐），
 * 也刻意让两个推荐板块一眼可分——**发现仓库**是你主动搜（去 GitHub 找还没 Star 的），
 * **为你推荐**是系统主动推（不用输入，基于你已有的 Star 算出来）。
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'recommend', label: '发现仓库', hint: '说一句话，找到还没 Star 过的仓库' },
  { key: 'overview', label: '收藏总览', hint: '你的 Star 数据统计与图表' },
  { key: 'manage', label: '收藏管理', hint: '筛选、Fork、Clone 全部 Star' },
  { key: 'similar', label: '为你推荐', hint: '从你 Star 过的仓库出发，推荐可能喜欢的' },
  { key: 'report', label: '每周回顾', hint: '本周新增 Star 的图表与 AI 总结' },
  { key: 'settings', label: '设置', hint: '主题、GitHub Token、AI 配置' }
]
