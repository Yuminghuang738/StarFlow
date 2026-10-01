# 主进程内部函数签名契约（冻结）

> 主进程各模块之间互相 import 的函数签名。**签名冻结，实现由各负责人填充。**
> 骨架阶段这些函数体是"mock 分支 + throw NOT_IMPLEMENTED"，所以任何人都不阻塞。

## src/main/config.ts —— 负责人 P7
export function isMockMode(): boolean
export function getEnv(): { openaiKey: string; openaiBaseUrl: string; modelName: string; githubToken: string; githubOauthClientId: string }

## src/main/store.ts —— 负责人 P3
export function getToken(): Promise<string | null>
export function saveToken(token: string): Promise<void>
export function hasToken(): Promise<boolean>
export function getRepos(): Promise<Repo[]>
export function saveRepos(repos: Repo[]): Promise<void>
export function updateLocalState(fullName: string, state: Partial<LocalState>): Promise<void>
export function clearToken(): Promise<void>

说明：
- MOCK_MODE=true 时读写 starpilot.mock.db.json，否则读写 starpilot.db.json（避免污染真实数据）
- getRepos() 在读到的列表为空且 MOCK_MODE=true 时，用 mockStarred() 的结果做种子并落盘
- saveToken 优先用 Electron safeStorage 加密后存本地（base64 密文），禁止以任何形式把明文写入磁盘
- safeStorage.isEncryptionAvailable() 为 false（例如没装 keyring 的 Linux）时，token 只保存在主进程内存中、不写盘，重启后需在设置页重新填写
- clearToken 先写盘、再清内存（与 saveToken 相反），保证拿不到「磁盘上还有、内存已清」的中间态；不清 reposCache

## src/main/mock.ts —— 负责人 P7
export function mockStarred(): Promise<Repo[]>
export function mockEnrich(repos: Repo[]): Promise<Repo[]>
export function mockReadme(fullName: string): Promise<string>
export function mockReleases(fullName: string): Promise<Release[]>
export function mockCommits(fullName: string): Promise<Commit[]>
export function mockUnstar(fullName: string): void
export function mockFork(fullName: string): Repo
export function mockSimilar(fullName: string): Repo[]
export function mockSummary(readme: string): string
export function mockClassify(repo: Repo): AiCategory
export function mockReportSummary(repos: Repo[]): string

说明：mock.ts 是唯一的假数据源，内部维护一份内存态 starred 列表：
unstar 从内存列表移除、fork 写 local.forked_full_name，因此刷新后不会"复活"。

## src/main/github.ts —— 负责人 P1
export function fetchStarred(): Promise<Repo[]>
export function fetchReadme(fullName: string): Promise<string>
export function fetchReleases(fullName: string): Promise<Release[]>
export function fetchCommits(fullName: string): Promise<Commit[]>
export function unstar(fullName: string): Promise<void>
export function fork(fullName: string): Promise<Repo>

## src/main/local.ts —— 负责人 P3
export function chooseDir(): Promise<string | null>
export function clone(fullName: string, targetDir: string): Promise<string>
export function openDir(path: string): Promise<void>
export function getCloneProgress(fullName: string): CloneProgress | null

说明：MOCK_MODE=true 时 openDir 仍然走真实实现（shell.openPath），
因为演示前会预先 clone 好仓库，"打开目录"必须真的能打开。

getCloneProgress 是**同步的内存查询**，给渲染进程在 clone 进行中按固定间隔轮询用。
返回 null 表示该仓库当前没有进行中的克隆，界面据此不画进度条。
数据来自 simple-git 的 progress 回调（本仓库的 git 会在 stderr 上报
"Receiving objects: 47% (1234/2624)"），stage 为 null 表示 clone 已启动但 git
还没吐出第一行；elapsedMs 在每次读取时现算，不在写进度时算死（git 在 counting /
resolving 阶段可能十几秒不吭声，算死的话界面的秒数会冻住）。
MOCK_MODE=true 时不产生任何记录（全项目只有 mock.ts 一个假数据源，这里不另造假进度）。

## src/main/ai.ts —— 负责人 P2
export function summarize(readme: string): Promise<string>
export function classify(repo: Repo): Promise<AiCategory>
export function enrichRepos(repos: Repo[]): Promise<Repo[]>
export function generateReport(repos: Repo[]): Promise<string>

说明：enrichRepos 内部用 p-limit 3 并发跑 summarize + classify，
结果写回 store.saveRepos() 并返回完整列表（前端只调一次，不要在前端循环调用）。

## src/main/report.ts —— 负责人 P4
export function generate(): Promise<WeeklyReport>

## src/main/recommend.ts —— 负责人 P4
export function similar(fullName: string): Promise<Repo[]>

## src/main/tracker.ts —— 负责人 P4
export function start(): void
export function stop(): void

## src/main/auth.ts —— 负责人 P7
export function getState(): AuthState
export function startDeviceFlow(): Promise<DeviceFlowInfo>
export function waitForLogin(): Promise<LoginOutcome>
export function cancelDeviceFlow(): void
export function dispose(): void

说明：GitHub OAuth Device Flow（无需 client_secret，client id 来自环境变量
GITHUB_OAUTH_CLIENT_ID）。waitForLogin 只 resolve 不 reject，取消 / 超时 / 失败都算
正常结局，走 LoginOutcome 的 data 分支返回。token 绝不进渲染进程，LoginOutcome 只带
AuthUser。MOCK_MODE=true 时不提供该能力（AuthState.available 恒为 false），
因为 mock.ts 是全项目唯一的假数据源，这里不另造一套假的设备流。
dispose() 挂在 app.on('before-quit') 上，清掉挂起的轮询定时器。
