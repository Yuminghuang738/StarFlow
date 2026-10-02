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
  GithubViewer,
  CloneProgress,
  LocalSyncStatus,
  LocalUpdateOutcome,
  AiConfigView,
  AiConfigPatch,
  AiConnectionResult,
  AiEnrichProgress,
  LogSnapshot
} from '@shared/types'
import type { CollectionAnalysis } from '@shared/ai-providers'
import type { RecommendForYou } from '@shared/recommend'

export interface StarFlowApi {
  github: {
    fetchStarred(): Promise<IpcResult<Repo[]>>
    fetchReadme(fullName: string): Promise<IpcResult<string>>
    fetchReleases(fullName: string): Promise<IpcResult<Release[]>>
    fetchCommits(fullName: string): Promise<IpcResult<Commit[]>>
    unstar(fullName: string): Promise<IpcResult<void>>
    fork(fullName: string): Promise<IpcResult<Repo>>
    star(fullName: string): Promise<IpcResult<Repo>>
  }
  local: {
    chooseDir(): Promise<IpcResult<string | null>>
    clone(fullName: string, targetDir: string): Promise<IpcResult<string | null>>
    openDir(path: string): Promise<IpcResult<void>>
    getCloneProgress(fullName: string): Promise<IpcResult<CloneProgress | null>>
    removeClone(fullName: string): Promise<IpcResult<string | null>>
    pruneClones(): Promise<IpcResult<string[]>>
    cancelClone(fullName: string): Promise<IpcResult<boolean>>
    /** 每个已 clone 仓库落后上游多少。只回已 clone 的那些，结果不落盘 */
    checkUpdates(): Promise<IpcResult<LocalSyncStatus[]>>
    /** 快进更新一个本地副本。kind 为 refused-* 是预期内的拒绝，不是失败 */
    updateClone(fullName: string): Promise<IpcResult<LocalUpdateOutcome>>
  }
  ai: {
    summarize(readme: string): Promise<IpcResult<string>>
    classify(repo: Repo): Promise<IpcResult<AiCategory>>
    enrichRepos(repos: Repo[]): Promise<IpcResult<Repo[]>>
    /** 补全进度（轮询用）。running 为 false 时 done/total 归零，不是"跑完了" */
    enrichProgress(): Promise<IpcResult<AiEnrichProgress>>
    generateReport(repos: Repo[]): Promise<IpcResult<string>>
    testConnection(): Promise<IpcResult<AiConnectionResult>>
    /** 收藏画像。入参是渲染进程算好的统计摘要；失败与未配置都走 data（不抛错） */
    analyzeCollection(digest: string): Promise<IpcResult<CollectionAnalysis>>
  }
  store: {
    getRepos(): Promise<IpcResult<Repo[]>>
    saveRepos(repos: Repo[]): Promise<IpcResult<void>>
    saveToken(token: string): Promise<IpcResult<void>>
    hasToken(): Promise<IpcResult<boolean>>
    updateLocalState(fullName: string, state: Partial<LocalState>): Promise<IpcResult<void>>
    clearToken(): Promise<IpcResult<void>>
    getAiConfig(): Promise<IpcResult<AiConfigView>>
    saveAiConfig(patch: AiConfigPatch): Promise<IpcResult<void>>
    clearAiKey(): Promise<IpcResult<void>>
  }
  report: {
    generate(): Promise<IpcResult<WeeklyReport>>
  }
  log: {
    /** 主进程 console 的镜像缓冲快照（正序，最多 LOG_BUFFER_LIMIT 条） */
    tail(): Promise<IpcResult<LogSnapshot>>
    /** 清空缓冲（total / dropped 一起归零），不影响终端输出 */
    clear(): Promise<IpcResult<void>>
  }
  recommend: {
    similar(fullName: string): Promise<IpcResult<Repo[]>>
    forQuery(query: string): Promise<IpcResult<Repo[]>>
    /** 为你推荐。种子藏在主进程里（整份收藏的画像），这里只传「换一批」的位移 */
    forYou(offset: number): Promise<IpcResult<RecommendForYou>>
  }
  tracker: {
    start(): Promise<IpcResult<void>>
    stop(): Promise<IpcResult<void>>
  }
  auth: {
    getState(): Promise<IpcResult<AuthState>>
    startDeviceFlow(): Promise<IpcResult<DeviceFlowInfo>>
    waitForLogin(): Promise<IpcResult<LoginOutcome>>
    cancelDeviceFlow(): Promise<IpcResult<void>>
    /** 用已保存的 token 现查当前账号。三种"没拿到"在 reason 里如实区分，不抛错 */
    getUser(): Promise<IpcResult<GithubViewer>>
  }
  window: {
    minimize(): Promise<IpcResult<void>>
    toggleMaximize(): Promise<IpcResult<boolean>>
    close(): Promise<IpcResult<void>>
    isMaximized(): Promise<IpcResult<boolean>>
  }
}

declare global {
  interface Window {
    api: StarFlowApi
  }
}
