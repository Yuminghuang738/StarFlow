// 负责人：P7（集成工程师独占维护，Wave 1 期间不再改动）
// 这是唯一把 renderer 的 invoke 和主进程业务模块接起来的地方。

import 'dotenv/config'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { IpcResult, Repo, LocalState } from '@shared/types'
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

// ============================================================
// 统一 handler 包装器
// ============================================================

// 这里刻意不写 (...args: any[])[]：any 会被 @typescript-eslint/no-explicit-any 拦下，
// 而 never[] 是"任意参数列表"的标准写法（never 可赋给任何类型），既过 lint 又保留
// 每个 handler 自己的参数类型。
type AnyFn<T> = (...args: never[]) => Promise<T> | T

function handle<T>(channel: string, fn: AnyFn<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<IpcResult<T>> => {
    try {
      // 第一个参数 event 必须丢弃，否则业务函数会多收到一个 event
      const data = await (fn as (...a: unknown[]) => Promise<T> | T)(...args)
      return { ok: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipc] ${channel} 失败:`, message)
      return { ok: false, error: message }
    }
  })
}

// ============================================================
// 27 个通道，一个都不能少也不能多
// ============================================================

function registerHandlers(): void {
  // GitHub —— P1
  handle(IPC.GITHUB_FETCH_STARRED, () => github.fetchStarred())
  handle(IPC.GITHUB_FETCH_README, (fullName: string) => github.fetchReadme(fullName))
  handle(IPC.GITHUB_FETCH_RELEASES, (fullName: string) => github.fetchReleases(fullName))
  handle(IPC.GITHUB_FETCH_COMMITS, (fullName: string) => github.fetchCommits(fullName))

  // unstar 是破坏性操作，"unstar 成功后从本地列表移除"这条规则由主进程保证，
  // 前端不需要自己删。前端仍负责二次确认弹窗（那是 UI 职责）。
  handle<void>(IPC.GITHUB_UNSTAR, async (fullName: string) => {
    await github.unstar(fullName)
    const repos = await store.getRepos()
    await store.saveRepos(repos.filter((r) => r.full_name !== fullName))
  })
  handle(IPC.GITHUB_FORK, (fullName: string) => github.fork(fullName))

  // 本地 Git —— P3
  handle(IPC.LOCAL_CHOOSE_DIR, () => local.chooseDir())
  handle(IPC.LOCAL_CLONE, (fullName: string, targetDir: string) => local.clone(fullName, targetDir))
  handle(IPC.LOCAL_OPEN_DIR, (path: string) => local.openDir(path))

  // AI —— P2
  handle(IPC.AI_SUMMARIZE, (readme: string) => ai.summarize(readme))
  handle(IPC.AI_CLASSIFY, (repo: Repo) => ai.classify(repo))
  handle(IPC.AI_ENRICH_REPOS, (repos: Repo[]) => ai.enrichRepos(repos))
  handle(IPC.AI_GENERATE_REPORT, (repos: Repo[]) => ai.generateReport(repos))

  // 存储 —— P3
  handle(IPC.STORE_GET_REPOS, () => store.getRepos())
  handle(IPC.STORE_SAVE_REPOS, (repos: Repo[]) => store.saveRepos(repos))
  handle(IPC.STORE_SAVE_TOKEN, (token: string) => store.saveToken(token))
  handle(IPC.STORE_HAS_TOKEN, () => store.hasToken())
  handle(IPC.STORE_UPDATE_LOCAL_STATE, (fullName: string, state: Partial<LocalState>) =>
    store.updateLocalState(fullName, state)
  )
  handle(IPC.STORE_CLEAR_TOKEN, () => store.clearToken())

  // 周报 —— P4
  handle(IPC.REPORT_GENERATE, () => report.generate())

  // 推荐 —— P4
  handle(IPC.RECOMMEND_SIMILAR, (fullName: string) => recommend.similar(fullName))

  // 定时追踪 —— P4。刻意不在启动时自动 start，由前端显式调用
  handle(IPC.TRACKER_START, () => tracker.start())
  handle(IPC.TRACKER_STOP, () => tracker.stop())

  // 登录 —— P7
  handle(IPC.AUTH_GET_STATE, () => auth.getState())
  handle(IPC.AUTH_START_DEVICE_FLOW, () => auth.startDeviceFlow())
  // 这个 handler 会一直挂到用户完成授权、超时或取消为止（最长 15 分钟）。
  // 渲染进程 reload 会丢掉这个 invoke，但主进程的流程继续跑，
  // 重新挂载时靠 AUTH_GET_STATE 的 pending 字段恢复并重新挂上等待。
  handle(IPC.AUTH_WAIT_FOR_LOGIN, () => auth.waitForLogin())
  handle(IPC.AUTH_CANCEL_DEVICE_FLOW, () => auth.cancelDeviceFlow())
}

// ============================================================
// 窗口与生命周期
// ============================================================

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  console.log(`[main] MOCK_MODE = ${isMockMode()}`)
  registerHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 登录流程挂着一个 setTimeout 链（轮询 + 有效期兜底），退出前必须清掉，
// 否则定时器会在进程拆解期间触发。
app.on('before-quit', () => {
  auth.dispose()
})
