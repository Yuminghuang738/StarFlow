import type { AiCategory, Repo } from './types'

/**
 * 「为你推荐」的画像：从**整份收藏**里提炼出来的口味摘要。
 *
 * 为什么要有这个东西：原来这个板块要求用户先挑一个仓库当种子，等于把
 * 「我到底喜欢什么」这个问题又推回给了用户——而他其实已经把答案写在收藏列表里了。
 * 画像就是把那几百条收藏压成一句话（主要语言 / 高频主题 / 主分类），
 * 既用来拼搜索查询，也直接显示给用户看，让他知道这些推荐**凭什么**出现。
 *
 * 放在 shared 而不是 main：主进程算它（拼查询要用），渲染进程渲染它（要说清推荐理由），
 * 两边必须是同一个形状。类型定义本身不进 IPC 传输之外的任何逻辑。
 */
export interface RecommendProfile {
  /** 参与统计的收藏数。为 0 时其余字段都是空的，页面据此显示空态 */
  total: number
  /** 主要语言，按出现次数降序 */
  languages: string[]
  /** 高频 topic，按出现次数降序 */
  topics: string[]
  /** 出现最多的 AI 分类；一条都没分类时为 null */
  category: AiCategory | null
  /** 这次用的星数地板——画像里也带着它，方便解释「为什么没推荐那些小仓库」 */
  starFloor: number
}

/** 一次「为你推荐」的全部产物：推荐的仓库 + 生成它们的画像 */
export interface RecommendForYou {
  items: Repo[]
  profile: RecommendProfile
}
