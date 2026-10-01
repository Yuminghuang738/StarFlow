// 这是唯一把 renderer 的 invoke 和主进程业务模块接起来的地方。

import 'dotenv/config'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { IPC } from '@shared/ipc'
import type { IpcResult, Repo, LocalState, AiConfigPatch } from '@shared/types'
import * as github from './github'
import * as local from './local'
import * as ai from './ai'
import * as store from './store'
import * as report from './report'
import * as recommend from './recommend'
import * as tracker from './tracker'
import * as auth from './auth'
import { isMockMode } from './config'

// ESM 下没有 __dirname，用 import.meta.url 推导
const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 当前主窗口。无边框改造之后 window:* 这几个 handler 要靠它。
 *
 * 为什么不能像别的 handler 那样从参数里拿 `event.sender`：下面 handle() 包装器
 * **刻意丢掉了第一个 event 参数**（业务函数不该凭空多收到一个参数），所以窗口类
 * handler 拿不到任何"sender 是谁"的信息。这是无边框改造最容易漏的一步。
 *
 * 只在 createWindow 里赋值、在窗口 closed 时清空：窗口没了以后这几个 handler
 * 静默返回，而不是对着一个已销毁的 BrowserWindow 调方法（那会抛
 * "Object has been destroyed"）。
 */
let mainWindow: BrowserWindow | null = null

// ============================================================
// 统一 handler 包装器
// ============================================================

// 这里刻意不写 (...args: any[])[]：any 会被 @typescript-eslint/no-explicit-any 拦下，
// 而 never[] 是"任意参数列表"的标准写法（never 可赋给任何类型），既过 lint 又保留
// 每个 handler 自己的参数类型。
type AnyFn<T> = (...args: never[]) => Promise<T> | T

/** 统一的错误文案取法：IPC 包装器和下面几个"部分成功"的 handler 都要用 */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function handle<T>(channel: string, fn: AnyFn<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<IpcResult<T>> => {
    try {
      // 第一个参数 event 必须丢弃，否则业务函数会多收到一个 event
      const data = await (fn as (...a: unknown[]) => Promise<T> | T)(...args)
      return { ok: true, data }
    } catch (err) {
      const message = errText(err)
      console.error(`[ipc] ${channel} 失败:`, message)
      return { ok: false, error: message }
    }
  })
}

// ============================================================
// 43 个通道，一个都不能少也不能多
// （自检办法：src/shared/ipc.ts 里的通道数与本文件的 handle() 调用数必须相等）
// ============================================================

function registerHandlers(): void {
  // GitHub
  handle(IPC.GITHUB_FETCH_STARRED, () => github.fetchStarred())
  handle(IPC.GITHUB_FETCH_README, (fullName: string) => github.fetchReadme(fullName))
  handle(IPC.GITHUB_FETCH_RELEASES, (fullName: string) => github.fetchReleases(fullName))
  handle(IPC.GITHUB_FETCH_COMMITS, (fullName: string) => github.fetchCommits(fullName))

  // unstar 是破坏性操作，"unstar 成功后从本地列表移除"这条规则由主进程保证，
  // 前端不需要自己删。前端仍负责二次确认弹窗（那是 UI 职责）。
  //
  // ⚠️ GitHub 那一步与本地落盘那一步必须分开报错。合在一个 catch 里的话，
  // 「取消失败」会同时覆盖"GitHub 上没取消"和"GitHub 上取消了、只是本地列表没写进去"
  // 两种情况——后者的真相是操作**已经生效**，用户看到"失败"会去重试、去 GitHub 核对，
  // 而列表里那张卡还在，反而更像"没生效"。
  handle<void>(IPC.GITHUB_UNSTAR, async (fullName: string) => {
    await github.unstar(fullName)
    try {
      const repos = await store.getRepos()
      await store.saveRepos(repos.filter((r) => r.full_name !== fullName))
    } catch (err) {
      throw new Error(
        `已经在 GitHub 上取消了 ${fullName} 的 Star，但本地列表没能更新（${errText(err)}）。` +
          ' 到「收藏管理」点一次「从 GitHub 同步」，这一条就会从列表里消失。'
      )
    }
  })
  handle(IPC.GITHUB_FORK, (fullName: string) => github.fork(fullName))

  // Star 与上面的 unstar 对称：「GitHub 上真的加了」和「本地列表跟着变」两条规则
  // 都由主进程保证，渲染进程只负责按钮上的忙碌态。
  // GitHub 的 PUT 是幂等的，重复 Star 不报错，所以这里必须防重——另一端 Star 过、
  // 或用户连点两次，都会走到这条分支，不防就是两张一样的卡片。
  // 分两段 try 的理由同 unstar：Star 已经在 GitHub 上成立了，本地落盘失败不能报成
  // "Star 失败"（github.star() 内部的回读失败也已经单独说清了）。
  handle(IPC.GITHUB_STAR, async (fullName: string) => {
    const repo = await github.star(fullName)
    try {
      const repos = await store.getRepos()
      if (repos.some((r) => r.full_name === repo.full_name)) return repo
      // 新 Star 的排在最前：列表的既有顺序是 starred_at 倒序
      await store.saveRepos([repo, ...repos])
    } catch (err) {
      throw new Error(
        `已经在 GitHub 上 Star 了 ${repo.full_name}，但本地列表没能更新（${errText(err)}）。` +
          ' 到「收藏管理」点一次「从 GitHub 同步」就会出现在列表里。'
      )
    }
    return repo
  })

  // 本地 Git
  handle(IPC.LOCAL_CHOOSE_DIR, () => local.chooseDir())
  handle(IPC.LOCAL_CLONE, (fullName: string, targetDir: string) => local.clone(fullName, targetDir))
  handle(IPC.LOCAL_OPEN_DIR, (path: string) => local.openDir(path))
  // 纯内存查询，不会失败也不会阻塞：渲染进程在 clone 进行中按固定间隔调它
  handle(IPC.LOCAL_CLONE_PROGRESS, (fullName: string) => local.getCloneProgress(fullName))

  // 删除本地副本。路径由主进程从 store 里查，渲染进程只交 fullName——所以渲染进程
  // 没有机会把任意路径送进 rm。"这四道闸"之类的路径安全策略全在 local.ts 里，这里只编排。
  handle(IPC.LOCAL_REMOVE_CLONE, async (fullName: string) => {
    const repos = await store.getRepos()
    const repo = repos.find((r) => r.full_name === fullName)
    const path = repo?.local?.cloned_path

    // 没有记录 = 已经清过了（可能刚被对账清掉）。幂等成功，不报错：
    // 用户点按钮时界面认为有，主进程这边可能已经不是了。
    if (!path) return null

    // 脏数据下两个仓库可能记着同一个路径，删 A 会把 B 的目录一并删掉，B 要等到下次
    // 对账才发现。这里直接拒绝——代价是这种情况必须手工处理，比静默删错强。
    if (repos.some((r) => r.full_name !== fullName && r.local?.cloned_path === path)) {
      throw new Error(`该路径同时被另一个仓库的记录占用，拒绝删除：${path}`)
    }

    const removed = await local.removeClone(fullName, path)
    // 即使目录本就不在（removed 为 null）也要清记录：清记录本身就符合用户意图，
    // 留着它卡片会一直显示"打开目录"，点了必然报错。
    await store.clearClonedPath(fullName)
    return removed
  })

  // 对账：记录里有、磁盘上已经没有的，静默清掉记录。
  // 只在渲染进程 load() 时调一次，是"读"触发的后台副作用，不弹任何提示。
  handle(IPC.LOCAL_PRUNE_CLONES, async () => {
    const repos = await store.getRepos()
    const names = await local.listMissingCloneRecords(repos)
    await store.clearClonedPaths(names)
    return names
  })

  // 取消克隆：真的会中止正在跑的 git 子进程（local.cancelClone 拿着 AbortController
  // 调 abort，simple-git 在 spawn.before 挂了监听、对子进程发 SIGINT）。
  // true = 确实中止了一个；**false 只表示"那一刻没有人在跑"**，界面以为在跑、主进程
  // 这边刚好收摊，属于正常竞态，不是错误——与 LOCAL_REMOVE_CLONE 一样是幂等语义，
  // 所以这里不抛错、也不加工返回值。
  //
  // ⚠️ 这条注释原来写的是「Phase 0 占位：cancelClone 现在恒返回 false，真正的实现
  // 在取消克隆那个 PR 里补」——那个 PR 早就落地了，注释没跟着改。危害和 R43 修掉的
  // docs/module-signatures.md 里那三行一模一样：照它读代码的人会以为取消是个空操作，
  // 从而绕开它自己造一套（或在 UI 上干脆不给取消入口）。
  handle(IPC.LOCAL_CANCEL_CLONE, (fullName: string) => local.cancelClone(fullName))

  // AI
  handle(IPC.AI_SUMMARIZE, (readme: string) => ai.summarize(readme))
  handle(IPC.AI_CLASSIFY, (repo: Repo) => ai.classify(repo))
  handle(IPC.AI_ENRICH_REPOS, (repos: Repo[]) => ai.enrichRepos(repos))
  handle(IPC.AI_GENERATE_REPORT, (repos: Repo[]) => ai.generateReport(repos))
  // 探针不抛错：失败也以 { ok: true, data: { ok: false, message } } 正常返回，
  // 让设置页能直接把 message 渲染成一行提示，而不是走 IpcResult 的 error 分支弹红 toast。
  handle(IPC.AI_TEST_CONNECTION, () => ai.testConnection())
  // 收藏画像：同样是「不抛错」的那一类——失败 / 未配置都以 { text: '', hint } 返回，
  // 总览页把 hint 渲染成一行说明即可，不该因为没配 Key 就弹 toast。
  handle(IPC.AI_ANALYZE_COLLECTION, (digest: string) => ai.analyzeCollection(digest))

  // 存储
  handle(IPC.STORE_GET_REPOS, () => store.getRepos())
  handle(IPC.STORE_SAVE_REPOS, (repos: Repo[]) => store.saveRepos(repos))
  handle(IPC.STORE_SAVE_TOKEN, (token: string) => store.saveToken(token))
  handle(IPC.STORE_HAS_TOKEN, () => store.hasToken())
  handle(IPC.STORE_UPDATE_LOCAL_STATE, (fullName: string, state: Partial<LocalState>) =>
    store.updateLocalState(fullName, state)
  )
  handle(IPC.STORE_CLEAR_TOKEN, () => store.clearToken())

  // AI 配置 —— 只做编排，存储实现在 store.ts、缓存刷新在 ai.ts
  // 保存/清除之后必须 refresh：config.ts 的覆盖层是内存态，不刷就是"填了 key 但没生效"。
  // refresh 挂在 handler 里而不是只挂启动路径，是为了不依赖"先启动再配置"这个顺序。
  handle(IPC.STORE_GET_AI_CONFIG, () => store.getAiConfig())
  handle(IPC.STORE_SAVE_AI_CONFIG, async (patch: AiConfigPatch) => {
    await store.saveAiConfig(patch)
    ai.refreshAiConfigCache()
  })
  handle(IPC.STORE_CLEAR_AI_KEY, async () => {
    await store.clearAiKey()
    ai.refreshAiConfigCache()
  })

  // 周报
  handle(IPC.REPORT_GENERATE, () => report.generate())

  // 推荐
  handle(IPC.RECOMMEND_SIMILAR, (fullName: string) => recommend.similar(fullName))
  handle(IPC.RECOMMEND_FOR_QUERY, (query: string) => recommend.forQuery(query))
  // 为你推荐：种子不在入参里，主进程按整份收藏的画像拼查询；offset 是「换一批」的位移
  handle(IPC.RECOMMEND_FOR_YOU, (offset: number) => recommend.forYou(offset))

  // 定时追踪。刻意不在启动时自动 start，由前端显式调用
  handle(IPC.TRACKER_START, () => tracker.start())
  handle(IPC.TRACKER_STOP, () => tracker.stop())

  // 登录
  handle(IPC.AUTH_GET_STATE, () => auth.getState())
  handle(IPC.AUTH_START_DEVICE_FLOW, () => auth.startDeviceFlow())
  // 这个 handler 会一直挂到用户完成授权、超时或取消为止（最长 15 分钟）。
  // 渲染进程 reload 会丢掉这个 invoke，但主进程的流程继续跑，
  // 重新挂载时靠 AUTH_GET_STATE 的 pending 字段恢复并重新挂上等待。
  handle(IPC.AUTH_WAIT_FOR_LOGIN, () => auth.waitForLogin())
  handle(IPC.AUTH_CANCEL_DEVICE_FLOW, () => auth.cancelDeviceFlow())

  // 无边框窗口
  // 这四个都对着模块级的 mainWindow 操作（handle() 丢掉了 event，拿不到 sender）。
  // 窗口已经不在了就静默返回：用户连点两次关闭、或窗口管理器先一步关掉了窗口，
  // 都不该在界面上弹一条"窗口不存在"的错误。
  handle(IPC.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize()
  })
  handle(IPC.WINDOW_TOGGLE_MAXIMIZE, () => {
    const win = mainWindow
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    // 必须返回切换**之后**的状态：本项目没有 main→renderer 推送，图标只能靠
    // "点击时用返回值权威更新" + "window.resize 兜底查询"两招来同步。
    return win.isMaximized()
  })
  handle(IPC.WINDOW_CLOSE, () => {
    mainWindow?.close()
  })
  handle(IPC.WINDOW_IS_MAXIMIZED, () => mainWindow?.isMaximized() ?? false)
}

// ============================================================
// 窗口与生命周期
// ============================================================

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    // 无边框：去掉原生标题栏与边框，关闭/最小化/最大化改由渲染进程的 TitleBar 自绘。
    // ⚠️ 代价（详见 docs/renderer-contracts.md）：Electron 让无边框窗口保留边缘拖拽缩放的
    // thickFrame 是 win32 专属，Linux 没有对应物；roundedCorners 在 Linux 上还依赖桌面环境
    // 是否支持客户端装饰。所以 Fedora 上很可能既没有阴影圆角、也拖不动边——先按现状做，
    // 实测之后要是真拖不动，再补 8 条自绘缩放热区（那需要多开一条 window:setBounds）。
    frame: false,
    // 首帧底色 = 亮色主题的 body 底色。窗口在渲染进程完成首次绘制前、以及后续
    // resize / 从最小化恢复时会露出这个颜色，不给就是 Chromium 默认的白。
    // 默认主题是亮色，所以这里给亮色最贴合。
    backgroundColor: '#f8fafc',
    // 先不显示，等渲染进程画完第一帧再 show。**这是防白闪的关键一步**：
    // index.html 里的防闪脚本能在首次绘制前就把 .dark 定下来，但如果窗口已经可见，
    // 用户仍会看到脚本执行前的那一帧。配合 show:false，暗色用户启动时就完全看不到白闪，
    // backgroundColor 只是 resize 之类场合的兜底。
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // 兜底：渲染进程加载失败（打包路径写错、被 CSP 拦下、dev server 没起来）时
  // ready-to-show 永远不会触发，窗口就一直不显示——那比白闪糟糕得多，用户会以为程序没启动。
  // 2s 后无条件显示，把"窗口存在"这件事的主动权拿回来。
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }, 2000)

  // window:* 那几个 handler 全靠这个引用（见文件顶部 mainWindow 的说明）
  mainWindow = win
  win.on('closed', () => {
    // 只在还是自己的时候清空：activate 之后重建窗口会覆盖这个变量，
    // 老窗口的 closed 事件如果晚到，不应该把新窗口的引用抹掉。
    if (mainWindow === win) mainWindow = null
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function bootstrap(): void {
  console.log(`[main] MOCK_MODE = ${isMockMode()}`)

  // frame:false 之后菜单栏本来也看不见了，但它的快捷键还活着（Ctrl+W 关窗、Ctrl+R 刷新、
  // Ctrl+Shift+I 开发者工具…），"没有菜单栏"必须是连快捷键一起没有，才叫真的去掉。
  Menu.setApplicationMenu(null)

  // AI 配置预热：把 store 里存的 key / baseUrl / model 灌进 config.ts 的覆盖层，
  // 之后 ai.client() 就能保持同步、且用户改完不用重启。
  // 签名是同步 void（冻结），读盘却在函数内部异步进行，失败只打日志、绝不阻断启动
  // ——启动路径上抛错等于应用打不开（细节见 ai.refreshAiConfigCache 的说明）。
  //
  // ⚠️ 这条注释原来写着「Phase 0 里这是个空函数、填实现的 PR 不用再动本文件」，
  // 实现落地后没改。留着会让人以为这里什么也没做，于是「配置了 key 却没生效」
  // 这类问题排查时第一个就把这条路径排除掉。
  ai.refreshAiConfigCache()

  registerHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

/**
 * 单实例锁。**这是数据安全问题，不是体验问题**，所以宁可打断第二次启动也要拦。
 *
 * 整个应用的状态是「一份内存态 + 单文件全量落盘」：`store` 里既有 `db.data.repos`，
 * 还有一份 `reposCache`，而写盘用的都是「调用方手里那份快照整体替换」。两个进程各持有
 * 一份这样的状态、指向同一个 `starflow.db.json`，谁后写谁覆盖谁——A 进程刚同步回来的
 * 收藏、刚记下的 clone 路径、刚跑完的 AI 结果，会被 B 进程的下一次写整份抹掉。
 * `steno` 的 temp+rename 只保证**文件不会写坏**，保证不了**内容不丢**。
 *
 * 必须在 `whenReady` 之前拿：拿到锁才有资格把窗口和 handler 建起来。
 * 拿不到的那个进程直接退出（它的窗口一个都不该出现），让已经开着的那个接管。
 */
if (app.requestSingleInstanceLock()) {
  // 这个监听器在**持有锁的那个进程**里触发（不是第二次启动的进程），
  // 所以这里能安全地引用 mainWindow。
  app.on('second-instance', () => {
    if (mainWindow === null) return
    // 最小化 / 被挡住时用户双击图标得不到任何反馈，所以还原并抬到最前
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.whenReady().then(bootstrap)
} else {
  app.quit()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 登录流程挂着一个 setTimeout 链（轮询 + 有效期兜底），退出前必须清掉，
// 否则定时器会在进程拆解期间触发。
app.on('before-quit', () => {
  auth.dispose()
})
