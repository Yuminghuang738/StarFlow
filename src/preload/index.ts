import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  Repo,
  Release,
  Commit,
  AiCategory,
  LocalState,
  IpcResult,
  WeeklyReport,
  AuthState,
  DeviceFlowInfo,
  LoginOutcome,
  CloneProgress,
  AiConfigView,
  AiConfigPatch,
  AiConnectionResult
} from '@shared/types'

const api = {
  github: {
    fetchStarred: (): Promise<IpcResult<Repo[]>> => ipcRenderer.invoke(IPC.GITHUB_FETCH_STARRED),
    fetchReadme: (fullName: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC.GITHUB_FETCH_README, fullName),
    fetchReleases: (fullName: string): Promise<IpcResult<Release[]>> =>
      ipcRenderer.invoke(IPC.GITHUB_FETCH_RELEASES, fullName),
    fetchCommits: (fullName: string): Promise<IpcResult<Commit[]>> =>
      ipcRenderer.invoke(IPC.GITHUB_FETCH_COMMITS, fullName),
    unstar: (fullName: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC.GITHUB_UNSTAR, fullName),
    fork: (fullName: string): Promise<IpcResult<Repo>> =>
      ipcRenderer.invoke(IPC.GITHUB_FORK, fullName),
    // 返回加 Star 之后的仓库记录（主进程同时已把它写进本地列表）
    star: (fullName: string): Promise<IpcResult<Repo>> =>
      ipcRenderer.invoke(IPC.GITHUB_STAR, fullName)
  },
  local: {
    chooseDir: (): Promise<IpcResult<string | null>> => ipcRenderer.invoke(IPC.LOCAL_CHOOSE_DIR),
    // data 为 null 表示克隆被用户取消（静默成功），不是失败
    clone: (fullName: string, targetDir: string): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke(IPC.LOCAL_CLONE, fullName, targetDir),
    openDir: (path: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC.LOCAL_OPEN_DIR, path),
    // 返回 null = 这个仓库还没开始克隆（或没克隆过），渲染进程据此不显示进度条
    getCloneProgress: (fullName: string): Promise<IpcResult<CloneProgress | null>> =>
      ipcRenderer.invoke(IPC.LOCAL_CLONE_PROGRESS, fullName),
    // 只传 fullName：路径由主进程查，渲染进程交不出任意路径
    removeClone: (fullName: string): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke(IPC.LOCAL_REMOVE_CLONE, fullName),
    // 返回被清理的 fullName 列表；渲染进程据此把自己内存里的 cloned_path 也抹掉
    pruneClones: (): Promise<IpcResult<string[]>> => ipcRenderer.invoke(IPC.LOCAL_PRUNE_CLONES),
    // true = 确实中止了一个在跑的克隆；false = 本来就没有人在跑（不算错）
    cancelClone: (fullName: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC.LOCAL_CANCEL_CLONE, fullName)
  },
  ai: {
    summarize: (readme: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC.AI_SUMMARIZE, readme),
    classify: (repo: Repo): Promise<IpcResult<AiCategory>> =>
      ipcRenderer.invoke(IPC.AI_CLASSIFY, repo),
    enrichRepos: (repos: Repo[]): Promise<IpcResult<Repo[]>> =>
      ipcRenderer.invoke(IPC.AI_ENRICH_REPOS, repos),
    generateReport: (repos: Repo[]): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC.AI_GENERATE_REPORT, repos),
    // 探针：不抛错，失败也以 { ok: false, message } 正常返回
    testConnection: (): Promise<IpcResult<AiConnectionResult>> =>
      ipcRenderer.invoke(IPC.AI_TEST_CONNECTION)
  },
  store: {
    getRepos: (): Promise<IpcResult<Repo[]>> => ipcRenderer.invoke(IPC.STORE_GET_REPOS),
    saveRepos: (repos: Repo[]): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC.STORE_SAVE_REPOS, repos),
    saveToken: (token: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC.STORE_SAVE_TOKEN, token),
    hasToken: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC.STORE_HAS_TOKEN),
    updateLocalState: (fullName: string, state: Partial<LocalState>): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC.STORE_UPDATE_LOCAL_STATE, fullName, state),
    clearToken: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.STORE_CLEAR_TOKEN),
    // 只回视图，**不回密钥**：AiConfigView 里没有 apiKey 字段
    getAiConfig: (): Promise<IpcResult<AiConfigView>> =>
      ipcRenderer.invoke(IPC.STORE_GET_AI_CONFIG),
    saveAiConfig: (patch: AiConfigPatch): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC.STORE_SAVE_AI_CONFIG, patch),
    clearAiKey: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.STORE_CLEAR_AI_KEY)
  },
  report: {
    generate: (): Promise<IpcResult<WeeklyReport>> => ipcRenderer.invoke(IPC.REPORT_GENERATE)
  },
  recommend: {
    similar: (fullName: string): Promise<IpcResult<Repo[]>> =>
      ipcRenderer.invoke(IPC.RECOMMEND_SIMILAR, fullName),
    // 一句话找仓库。AI 的搜索计划不跨进程，这里只传原句、只回结果
    forQuery: (query: string): Promise<IpcResult<Repo[]>> =>
      ipcRenderer.invoke(IPC.RECOMMEND_FOR_QUERY, query)
  },
  tracker: {
    start: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.TRACKER_START),
    stop: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.TRACKER_STOP)
  },
  auth: {
    getState: (): Promise<IpcResult<AuthState>> => ipcRenderer.invoke(IPC.AUTH_GET_STATE),
    startDeviceFlow: (): Promise<IpcResult<DeviceFlowInfo>> =>
      ipcRenderer.invoke(IPC.AUTH_START_DEVICE_FLOW),
    // 这个 invoke 最长会挂 15 分钟（设备码的有效期），由主进程的 expiryTimer 强制收敛
    waitForLogin: (): Promise<IpcResult<LoginOutcome>> =>
      ipcRenderer.invoke(IPC.AUTH_WAIT_FOR_LOGIN),
    cancelDeviceFlow: (): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC.AUTH_CANCEL_DEVICE_FLOW)
  },
  // 无边框窗口。frame:false 之后原生按钮没了，关闭/最小化/最大化只能走这里
  window: {
    minimize: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    // 返回切换之后的状态，渲染进程用它权威更新图标（没有 main→renderer 推送）
    toggleMaximize: (): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE),
    close: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
    // 兜底查询：窗口被 WM 的快捷键或拖拽吸附改变时，只有 resize 事件能察觉到
    isMaximized: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED)
  }
}

contextBridge.exposeInMainWorld('api', api)
