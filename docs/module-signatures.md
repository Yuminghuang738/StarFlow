# 主进程内部函数签名契约（冻结）

> 主进程各模块之间互相 import 的函数签名。**签名冻结，实现由各负责人填充。**
> 骨架阶段这些函数体是"mock 分支 + throw NOT_IMPLEMENTED"，所以任何人都不阻塞。

## src/main/config.ts —— 负责人 P7
export function isMockMode(): boolean
export function getEnv(): { openaiKey: string; openaiBaseUrl: string; modelName: string; githubToken: string }

## src/main/store.ts —— 负责人 P3
export function getToken(): Promise<string | null>
export function saveToken(token: string): Promise<void>
export function hasToken(): Promise<boolean>
export function getRepos(): Promise<Repo[]>
export function saveRepos(repos: Repo[]): Promise<void>
export function updateLocalState(fullName: string, state: Partial<LocalState>): Promise<void>

说明：
- MOCK_MODE=true 时读写 starpilot.mock.db.json，否则读写 starpilot.db.json（避免污染真实数据）
- getRepos() 在读到的列表为空且 MOCK_MODE=true 时，用 mockStarred() 的结果做种子并落盘
- saveToken 用 Electron safeStorage 加密后存本地，禁止明文落盘

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

说明：MOCK_MODE=true 时 openDir 仍然走真实实现（shell.openPath），
因为演示前会预先 clone 好仓库，"打开目录"必须真的能打开。

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
