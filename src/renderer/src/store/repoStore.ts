import { create } from 'zustand'
import type { Repo, LocalState, IpcResult } from '@shared/types'
import { unwrap, ipcErrorMessage } from '../lib/api'
import { pushToast } from '../components/common/Toast'
import { DEFAULT_FILTERS, selectRepos, type RepoFilters } from '../lib/repoQuery'

// 筛选/排序的实现与类型都在 lib/repoQuery.ts（纯函数，自检可打包）。
// 这里再导出一遍，只是为了让老的 `from '../store/repoStore'` 导入点不用改。
export type { RepoFilters, RepoSort } from '../lib/repoQuery'
export { DEFAULT_FILTERS, filterRepos, selectRepos, sortRepos } from '../lib/repoQuery'

export interface RepoStore {
  repos: Repo[]
  loading: boolean
  // —— 新增（非契约成员；契约允许新增，见 renderer-contracts.md）——
  enriching: boolean
  /** 最近一次**任何**操作的失败原文（给排查用）。界面的空态分叉别读它，读下面的 loadError */
  error: string | null
  /**
   * **只表示「读取收藏列表这一次」的结果**，只有 load() 会写它。
   *
   * 为什么不能和上面那个 error 合并：error 是"最近一次任何操作的失败原文"，
   * star / unstar / clone / saveToken 失败都会往里写。而读它的三处界面
   * （RepoList / Overview / Similar 的空态分叉）问的是「列表为什么是空的」——
   * 拿一个通用的最后错误去回答，就会出现"Star 失败（未配置 Token）"被渲染成
   * 「读取本地数据失败，本地数据都在」这种张冠李戴。
   */
  loadError: string | null
  filters: RepoFilters
  visibleRepos(): Repo[]
  setFilters(patch: Partial<RepoFilters>): void
  load(): Promise<void>
  refreshFromGitHub(): Promise<void>
  enrich(): Promise<void>
  unstar(fullName: string): Promise<void>
  star(fullName: string): Promise<void>
  fork(fullName: string): Promise<void>
  clone(fullName: string): Promise<void>
  openDir(path: string): Promise<void>
  // —— 本地副本管理（非契约成员；新增不算修改契约，但必须同步进 renderer-contracts.md）——
  removeLocal(fullName: string): Promise<void>
  pruneLocalClones(): Promise<void>
  // —— 取消克隆（取消克隆 PR 落地）：裸调 window.api，失败才提示，false 不是错误 ——
  cancelClone(fullName: string): Promise<void>
  /**
   * **真的在跑**克隆的那个仓库（不是"点了 Clone"）。null = 现在没有克隆在跑。
   *
   * 为什么不能只看 RepoActions 自己的 pendingAction：`clone()` 的前半段是原生目录选择框，
   * 用户可以在里面停留几十秒；而主进程的进度记录在克隆结束后是**刻意留着**最后一条的
   * （local.ts 与 clone-progress 自检都钉着"克隆结束后记录仍在，不闪回 null"——它是为了
   * 不让进度条在收尾那一刻闪回空白）。于是这段时间里进度条一挂上就会轮询到**上一次**
   * 克隆的记录：一条 100% 的满进度 + 上一次的「已用 312s」，看起来像"这次已经跑完了"。
   *
   * 为什么不在类型上解决：`CloneProgress`（shared/types.ts）里没有"这一条属于哪一次"的
   * 信息，前端**分不出**那也是真的——而给它加字段属于动冻结契约。改到这一侧就不需要
   * 分得出了：界面只在真的开始跑之后才去问，之前那些记录根本不会被读到。
   */
  cloningFullName: string | null
  // —— 新增 token 方法 ——
  /**
   * 读「有没有 token」。**null 表示这一次没读到，不是"没有"**——见实现里的说明。
   * 页面必须把两者分开显示，否则一次读取失败会装成"未配置"。
   */
  hasToken(): Promise<boolean | null>
  /**
   * 保存 token，**返回值表示这一次到底存进去了没有**。
   *
   * 为什么要有这个信号（原签名是 Promise<void>）：唯一的调用方是设置页，它在保存
   * 之后会把输入框清空。而"清空"本身就是一句"成了"——保存失败（写盘失败 / 无内存
   * 后端且写库出错）时照样清空，用户刚粘进去的那串 token 就没了，界面上却与成功
   * 长得一模一样，只能回去再拷一次。与 reloadAiConfig() 用返回值区分
   * 「保存成功」和「随后读状态失败」是同一条约定。
   *
   * 失败仍然**不抛错**（toast 由 unwrap 弹，error 字段由这里写），只是把结果交回调用方。
   */
  saveToken(token: string): Promise<boolean>
}

/**
 * 把 GitHub 同步回来的远端数据与本地已有数据按 full_name 合并：
 * 以远端为基准，保留本地独有的 local / ai_summary / ai_category，
 * 避免每次同步丢掉「已 Fork / 已 clone / 已分类」标记（演示时最容易被发现的问题）。
 */
function mergeRepos(remote: Repo[], prev: Repo[]): Repo[] {
  const prevByFullName = new Map(prev.map((r) => [r.full_name, r]))
  return remote.map((r) => {
    const old = prevByFullName.get(r.full_name)
    if (!old) return r
    const merged: Repo = { ...r }
    if (old.local && !r.local) merged.local = old.local
    if (old.ai_summary && !r.ai_summary) merged.ai_summary = old.ai_summary
    if (old.ai_category && !r.ai_category) merged.ai_category = old.ai_category
    return merged
  })
}

/**
 * 内存态里抹掉某个仓库的 cloned_path。
 *
 * 必须显式 delete 后重建对象：写成 `{ ...r.local, cloned_path: undefined }` 是不行的，
 * 那个键会留在对象里（IPC 的结构化克隆和 JSON.stringify 才丢 undefined，内存里不丢），
 * 于是 `r.local?.cloned_path` 仍然是"有值"，卡片照样画成已克隆。
 */
function withoutClonedPath(repo: Repo): Repo {
  if (!repo.local?.cloned_path) return repo
  const local: LocalState = { ...repo.local }
  delete local.cloned_path
  return { ...repo, local }
}

/**
 * 把本地标记（cloned_path / forked_full_name）写进库文件。
 *
 * **不抛错**：成功返回 null，失败返回错误文案。为什么不用 unwrap()——它失败时弹一条
 * 光秃秃的报错 toast，而这两个调用点的共同点是「事情本体已经真的发生了」：仓库已经
 * 克隆到磁盘上、fork 已经在你账号下建出来（主进程调的是 createFork）。唯一失败的
 * 是"本机把这件事记下来"这一步。报成"操作失败"会诱发用户再点一次，还会让人以为
 * fork 根本没建成。与主进程 index.ts 里 star / unstar 两个 handler 是同一条约定：
 * 吞掉报错可以，但"已经成立的事实"不能被说成"没成"。
 */
async function persistLocalState(
  fullName: string,
  state: Partial<LocalState>
): Promise<string | null> {
  try {
    const res = await window.api.store.updateLocalState(fullName, state)
    return res.ok ? null : res.error
  } catch (err) {
    return ipcErrorMessage(err)
  }
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  repos: [],
  loading: false,
  enriching: false,
  error: null,
  loadError: null,
  cloningFullName: null,
  filters: { ...DEFAULT_FILTERS },

  visibleRepos() {
    const { repos, filters } = get()
    // Date.now() 在这里是合理的：这是一个即时快照式的方法（组件不该订阅它，
    // 见 lib/repoQuery.ts 的说明），活跃度筛选按「此刻」判正是它该有的语义。
    return selectRepos(repos, filters, Date.now())
  },

  setFilters(patch) {
    set((s) => ({ filters: { ...s.filters, ...patch } }))
  },

  async load() {
    // loadError 必须在这里清掉：它是"这一次读取的结果"，不是"历史上出过错"。
    // 不清的话，重试成功之后它还挂着，而页面会**把它画出来**——那就会在一次成功的
    // 加载之后继续显示"读取失败"。
    set({ loading: true, error: null, loadError: null })
    let loaded = false
    try {
      set({ repos: await unwrap(window.api.store.getRepos()) })
      loaded = true
    } catch (err) {
      // unwrap 已经弹过 toast；这里只写错误字段、保留旧数据，不把 repos 清空
      const message = ipcErrorMessage(err)
      set({ error: message, loadError: message })
    } finally {
      set({ loading: false })
    }

    // 对账：把"记录里有、磁盘上已经被用户删掉"的 cloned_path 静默清掉，卡片自然
    // 回到 [Clone] 态。折在 load() 里而不是让页面自己调，省得每个页面各写一遍。
    // 只在真的读到列表时才跑；pruneLocalClones 内部绝不抛，不会影响上面的加载结果。
    if (loaded) await get().pruneLocalClones()
  },

  async refreshFromGitHub() {
    set({ loading: true, error: null })
    try {
      const remote = await unwrap(window.api.github.fetchStarred())
      const merged = mergeRepos(remote, get().repos)
      await unwrap(window.api.store.saveRepos(merged))
      set({ repos: merged })
      pushToast({ type: 'success', message: `已从 GitHub 同步 ${merged.length} 个仓库` })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    } finally {
      set({ loading: false })
    }
  },

  async enrich() {
    if (get().enriching) return
    set({ enriching: true, error: null })
    try {
      // 落盘由主进程的 ai.enrichRepos 负责，渲染进程只更新本地列表
      set({ repos: await unwrap(window.api.ai.enrichRepos(get().repos)) })
      pushToast({ type: 'success', message: 'AI 分类补全完成' })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    } finally {
      set({ enriching: false })
    }
  },

  async unstar(fullName) {
    try {
      await unwrap(window.api.github.unstar(fullName))
      // 主进程已改 store，这里同步内存态：从本地列表过滤掉该仓库
      set((s) => ({ repos: s.repos.filter((r) => r.full_name !== fullName) }))
      pushToast({ type: 'success', message: '已取消 Star' })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  // 推荐列表里的「Star 此仓库」走这里。
  // 必须落在 repoStore（而不是推荐自己的 store）：Star 完管理页/总览/周报用的都是
  // 这一个数组，放别处就会出现"推荐页说已 Star、管理页没有它"。
  async star(fullName) {
    try {
      const repo = await unwrap(window.api.github.star(fullName))
      // 防重：GitHub 的 Star 是幂等的，另一端 Star 过或用户连点两次都会返回到这里，
      // 直接 push 会出现两张一模一样的卡片。
      if (get().repos.some((r) => r.full_name === repo.full_name)) {
        pushToast({ type: 'success', message: `${repo.full_name} 已经在你的列表里了` })
        return
      }
      // 新 Star 的排在最前，与主进程落盘的顺序保持一致
      set((s) => ({ repos: [repo, ...s.repos] }))
      pushToast({ type: 'success', message: `已 Star ${repo.full_name}` })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async fork(fullName) {
    try {
      // ⚠️ 这个返回值是**你 fork 出来的那个新仓库**，不是原仓库的更新版。
      // 主进程 github.fork() 拿 GitHub 的 createFork 响应构造对象，里面的
      // full_name 是「你的用户名/repo」、stargazers_count 是新 fork 的 0、id 也是新的；
      // mockFork() 同样把 forked_full_name 填成一个**别的**仓库名。
      //
      // 所以这里**绝不能拿它替换列表里那一条**（曾经就是那么写的）：那一行会当场
      // 改名换姓、星标掉到 0、点进去跳到 fork 而不是原仓库，而且下次同步时
      // mergeRepos 拿这个新名字去匹配远端的原名，匹配不上——原仓库会被当成新仓库
      // 重新插进来，fork 标记也就丢了，而磁盘上主进程记的一直是原名。内存与磁盘
      // 就此分家。fork 只是给**原仓库**打一个标记，原仓库本身一个字都不该动。
      const repo = await unwrap(window.api.github.fork(fullName))
      // 两条路径（真实 / mock）都已经把 fork 名放在 local 里了，优先信它；
      // 万一上游没给（拿不到 fork 名），退回 repo.full_name——总比显示空白强。
      const forkedFullName = repo.local?.forked_full_name ?? repo.full_name
      const forkedAt = repo.local?.forked_at ?? new Date().toISOString()

      set((s) => ({
        repos: s.repos.map((r) =>
          r.full_name === fullName
            ? { ...r, local: { ...r.local, forked_full_name: forkedFullName, forked_at: forkedAt } }
            : r
        )
      }))
      // 落盘用的键是**原仓库**的 fullName、值是 fork 名，与主进程 index.ts 的约定一致。
      // 这一步失败不能报成"Fork 失败"：fork 已经真的在你账号下建出来了，失败的只是
      // "本机记住它"。所以内存态保持在已 Fork（它此刻是真的），另把后果说清楚——
      // 这个标记没落盘，重启后就没了。给一条真能走的补救路径：重启后按钮会回到
      // 「Fork」，再点一次即可（对已 fork 的仓库 GitHub 返回的是同一个 fork，不会重复建）。
      const persistError = await persistLocalState(fullName, {
        forked_full_name: forkedFullName,
        forked_at: forkedAt
      })
      if (persistError !== null) {
        set({ error: persistError })
        pushToast({
          type: 'error',
          message:
            `已经在 GitHub 上 Fork 到 ${forkedFullName}，但本地没能记住这个标记（${persistError}）。` +
            '重启应用后这一行会回到「Fork」按钮的状态，再点一次就能把标记补回来。'
        })
        return
      }
      pushToast({ type: 'success', message: `已 Fork 到 ${forkedFullName}` })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async clone(fullName) {
    try {
      const dir = await unwrap(window.api.local.chooseDir())
      if (dir === null) return // 用户取消选目录，静默返回，不当成错误

      // 刻意裸调、不用 unwrap()：主进程的 clone 现在用 data === null 表示"已被用户
      // 取消"——那是一次成功但无结果的调用，不能按失败处理。而 unwrap 在 { ok: false }
      // 时会先弹一条红 toast 再抛错，只有真失败才该弹，取消必须静默。
      //
      // cloningFullName 只在**这一刻**才有值：目录选择框已经关掉、这次克隆真的开跑了。
      // 进度条与「取消克隆」都据此挂载（见 RepoActions 与这个字段的说明）——
      // 早一步挂上就会读到上一次留下的那条 100% 记录。
      let res: IpcResult<string | null>
      set({ cloningFullName: fullName })
      try {
        res = await window.api.local.clone(fullName, dir)
      } finally {
        set({ cloningFullName: null })
      }
      if (!res.ok) {
        set({ error: res.error })
        pushToast({ type: 'error', message: res.error })
        return
      }
      if (res.data === null) return // 已取消：静默成功，不弹提示、不写 store

      const path = res.data
      // 主进程的 local.clone 只建目录，不写 db；cloned_path 必须由这里落盘，
      // 否则 onlyCloned 筛选永远命中不到任何仓库。
      // ⚠️ 落盘失败同样**不能**报成"克隆失败"：目录已经真的在磁盘上了。而且这一条
      // 比 fork 更麻烦——主进程的磁盘对账的数据源正是这份记录，记录没写进去，
      // 对账也就找不到这个目录（它只会成为一份应用不知道的孤儿目录）。
      // 内存态刻意**不**更新：假装已克隆会让「打开目录」能用、而「删除本地副本」
      // 因为主进程没有记录必然失败，那一行就成了半真半假的状态。宁可这一行保持
      // 未克隆 + 一句把后果说全的提示。
      const persistError = await persistLocalState(fullName, { cloned_path: path })
      if (persistError !== null) {
        set({ error: persistError })
        pushToast({
          type: 'error',
          message:
            `已经克隆到 ${path}，但本地没能记住这个路径（${persistError}）。` +
            '这一行仍会显示成未克隆，重启后应用也不知道这个目录的存在；' +
            '要重新接管它，先手动删掉那个目录，再点一次 Clone。'
        })
        return
      }
      set((s) => ({
        repos: s.repos.map((r) =>
          r.full_name === fullName ? { ...r, local: { ...r.local, cloned_path: path } } : r
        )
      }))
      pushToast({ type: 'success', message: `已克隆到 ${path}` })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async cancelClone(fullName) {
    try {
      // 同样裸调：取消的成败由主进程用布尔值表达，data === false 是"本来没人在跑"
      // 的正常竞态，不是错误，走 unwrap 反而会把 false 当成要处理的结果。
      const res = await window.api.local.cancelClone(fullName)
      if (!res.ok) {
        console.error('[repoStore] 取消克隆失败：', res.error)
        pushToast({ type: 'error', message: res.error })
      }
      // 成功静默：无论确实中止了（true）还是本来就没人在跑（false）
    } catch (err) {
      console.error('[repoStore] 取消克隆失败：', err)
      pushToast({ type: 'error', message: ipcErrorMessage(err) })
    }
  },

  async openDir(path) {
    try {
      await unwrap(window.api.local.openDir(path))
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async removeLocal(fullName) {
    try {
      const removed = await unwrap(window.api.local.removeClone(fullName))
      // 必须换新数组、换新对象：原地改 zustand 里的对象不触发重渲染，
      // 而且 TypeScript 完全不会提醒你写错了
      set((s) => ({
        repos: s.repos.map((r) => (r.full_name === fullName ? withoutClonedPath(r) : r))
      }))
      // 用主进程返回的实际路径：确认框显示的是渲染进程内存里的路径，两者理论上是两份数据
      pushToast({
        type: 'success',
        message: removed ? `已删除本地副本：${removed}` : '本地副本早已不在，只清掉了记录'
      })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },

  async pruneLocalClones() {
    try {
      // 刻意不走 unwrap / call：那两个封装（lib/api.ts）都会弹 toast，而对账必须是静默的
      // ——它挂在每次 load() 后面，用 unwrap 就等于每次启动都弹一条，
      // 而且弹的还是用户没做过任何操作的一条提示。
      const res = await window.api.local.pruneClones()
      if (!res.ok || res.data.length === 0) return

      const cleared = new Set(res.data)
      set((s) => ({
        repos: s.repos.map((r) => (cleared.has(r.full_name) ? withoutClonedPath(r) : r))
      }))
      console.log('[repoStore] 对账清除本地副本记录：', res.data)
    } catch (err) {
      // 对账失败绝不能影响列表加载，也不打扰用户，只留一条排查日志
      console.warn('[repoStore] 本地副本对账失败，已忽略', err)
    }
  },

  async hasToken(): Promise<boolean | null> {
    try {
      return await unwrap(window.api.store.hasToken())
    } catch (err) {
      // ⚠️ 这里**绝不返回 false**。false 在设置页的含义是"未配置"，会显示
      // 「未配置」徽章并把用户引向重新填一遍 token——而真实情况往往只是这一次
      // 没读到（库文件坏了 / 主进程没起来），token 其实好好地存着。
      // 返回 null 表示"不知道"，页面据此显示「读不到」而不是「未配置」；
      // 这与本项目一贯的取舍一致：可以吞掉报错，但不能把"不知道"降级成"确实没有"。
      // （unwrap 已经弹过 toast，这里只记下来给页面用。）
      set({ error: ipcErrorMessage(err) })
      return null
    }
  },

  async saveToken(token) {
    try {
      await unwrap(window.api.store.saveToken(token))
      pushToast({ type: 'success', message: '已保存' })
      return true
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
      return false
    }
  }
}))
