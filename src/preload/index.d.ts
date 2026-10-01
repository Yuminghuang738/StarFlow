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

export interface StarFlowApi {
  github: {
    fetchStarred(): Promise<IpcResult<Repo[]>>
    fetchReadme(fullName: string): Promise<IpcResult<string>>
    fetchReleases(fullName: string): Promise<IpcResult<Release[]>>
    fetchCommits(fullName: string): Promise<IpcResult<Commit[]>>
    unstar(fullName: string): Promise<IpcResult<void>>
    fork(fullName: string): Promise<IpcResult<Repo>>
  }
  local: {
    chooseDir(): Promise<IpcResult<string | null>>
    clone(fullName: string, targetDir: string): Promise<IpcResult<string>>
    openDir(path: string): Promise<IpcResult<void>>
    getCloneProgress(fullName: string): Promise<IpcResult<CloneProgress | null>>
    removeClone(fullName: string): Promise<IpcResult<string | null>>
    pruneClones(): Promise<IpcResult<string[]>>
    cancelClone(fullName: string): Promise<IpcResult<boolean>>
  }
  ai: {
    summarize(readme: string): Promise<IpcResult<string>>
    classify(repo: Repo): Promise<IpcResult<AiCategory>>
    enrichRepos(repos: Repo[]): Promise<IpcResult<Repo[]>>
    generateReport(repos: Repo[]): Promise<IpcResult<string>>
    testConnection(): Promise<IpcResult<AiConnectionResult>>
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
  recommend: {
    similar(fullName: string): Promise<IpcResult<Repo[]>>
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
