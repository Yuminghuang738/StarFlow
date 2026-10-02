import { create } from 'zustand'
import type { Repo } from '@shared/types'
import type { RecommendProfile } from '@shared/recommend'
import { unwrap, ipcErrorMessage } from '../lib/api'

/**
 * 「发现仓库」与「为你推荐」两个页面的状态。
 *
 * 为什么不塞进 repoStore：两者的生命周期完全不同。推荐结果在重跑一次搜索时就整个
 * 替换，塞进 repoStore 会让管理页/总览页跟着重渲染几百个节点。Star 动作仍然走
 * repoStore（那才是"我的仓库列表"），这里只放"这一次搜索/推荐的结果"。
 *
 * ⚠️ zustand v5 的取用纪律：组件里只订阅具体切片（`s => s.results`），
 * 不要订阅整个 store，也不要在 render 里调返回新数组的方法——useSyncExternalStore
 * 用严格相等比较快照，每次新数组都会被判成"变了"，直接无限重渲染。
 *
 * 结果放在模块级 store 里也意味着：切到别的板块再切回来，结果还在（页面是保活的，
 * 但保活不该是唯一保障）。
 *
 * ⚠️ 「为你推荐」原先走 recommend:similar（挑一个仓库当种子）。那条通道与
 * preload 上的 recommend.similar **都还在**（今晚不动已公开的接口），
 * 只是界面不再用它当主路径——要求用户先挑种子，等于把"我喜欢什么"又推回给用户，
 * 而那些答案早就写在收藏列表里了。现在改为整份收藏的画像（见 main/recommend.ts）。
 */

/** 连发两次搜索时，只认最后一次的结果；先发的晚回来不能覆盖后发的 */
let searchSeq = 0
let forYouSeq = 0

export interface RecommendStore {
  // —— 一句话找仓库 ——
  /** 输入框里的原文（受控输入用，与"已搜过的词"分开，便于显示"正在显示 X 的结果"） */
  query: string
  searchedQuery: string | null
  results: Repo[]
  searching: boolean
  searchError: string | null

  // —— 为你推荐 ——
  /** 「换一批」的位移，用来错开画像里排后面的语言与主题。结果与它一一对应 */
  forYouOffset: number
  forYouResults: Repo[]
  /** 这批推荐是凭什么推出来的。页面拿它告诉用户理由 */
  forYouProfile: RecommendProfile | null
  forYouLoading: boolean
  forYouError: string | null

  search(query: string): Promise<void>
  resetSearch(): void
  loadForYou(offset: number): Promise<void>
}

export const useRecommendStore = create<RecommendStore>((set) => ({
  query: '',
  searchedQuery: null,
  results: [],
  searching: false,
  searchError: null,

  forYouOffset: 0,
  forYouResults: [],
  forYouProfile: null,
  forYouLoading: false,
  forYouError: null,

  async search(query) {
    const q = query.trim()
    set({ query, searchedQuery: q === '' ? null : q })

    // 空查询 = 清空结果，不发请求（reason 也一起清掉，否则会留着上一次的红字）
    if (q === '') {
      searchSeq += 1 // 作废在飞的请求
      set({ results: [], searching: false, searchError: null })
      return
    }

    const seq = ++searchSeq
    set({ searching: true, searchError: null })
    try {
      const results = await unwrap(window.api.recommend.forQuery(q))
      if (seq !== searchSeq) return // 已经被更新的搜索取代，丢弃
      set({ results })
    } catch (err) {
      if (seq !== searchSeq) return
      // unwrap 已经弹过 toast（限频、没有 token 这类都得让用户看见），
      // 这里再留一份在页面上，免得 toast 3 秒就没了
      set({ searchError: ipcErrorMessage(err), results: [] })
    } finally {
      if (seq === searchSeq) set({ searching: false })
    }
  },

  resetSearch() {
    searchSeq += 1
    set({ query: '', searchedQuery: null, results: [], searching: false, searchError: null })
  },

  async loadForYou(offset) {
    // ⚠️ 没有成功之前**不动 forYouOffset**。原来是在这里就乐观地写进去的，
    // 于是失败也照样"消耗掉"一批：页面提示"再点「换一批」重试"，可那个按钮走的是
    // offset + 1，重试搜到的是再下一批，被跳过的那一批用户永远不会看到——
    // 而界面上没有任何东西提示漏了一批。现在失败后 offset 停在最后一次成功的位置，
    // 「换一批」重试的就是原来那一批。
    set({ forYouLoading: true, forYouError: null })
    const seq = ++forYouSeq
    try {
      const { items, profile } = await unwrap(window.api.recommend.forYou(offset))
      if (seq !== forYouSeq) return // 已经被更新的那一次取代，丢弃
      set({ forYouResults: items, forYouProfile: profile, forYouOffset: offset })
    } catch (err) {
      if (seq !== forYouSeq) return
      // unwrap 已经弹过 toast（限频、没有 token 这类都得让用户看见），
      // 这里再留一份在页面上，免得 toast 3 秒就没了
      set({ forYouError: ipcErrorMessage(err), forYouResults: [] })
    } finally {
      if (seq === forYouSeq) set({ forYouLoading: false })
    }
  }
}))
