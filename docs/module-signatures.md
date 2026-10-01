# 主进程内部函数签名契约（冻结）

> 主进程各模块之间互相 import 的函数签名。**签名冻结，实现由各负责人填充。**
> 骨架阶段这些函数体是"mock 分支 + throw NOT_IMPLEMENTED"，所以任何人都不阻塞。

## src/main/config.ts —— 负责人 P7
export function isMockMode(): boolean
export function getEnv(): { openaiKey: string; openaiBaseUrl: string; modelName: string; githubToken: string; githubOauthClientId: string }
export function setAiOverride(patch: Partial<{ apiKey: string; baseUrl: string; model: string }>): void

说明：getEnv() 恒为同步、不读文件、不抛错。setAiOverride 写入的是模块级内存覆盖层，
getEnv() 里只有 openaiKey / openaiBaseUrl / modelName 三个字段会读它，
优先级是 **界面里填的 > .env > 空串**。之所以要有这么一层，是为了让 ai.client()
保持同步——它被四个导出函数同步调用，改成 async 会把 async 传染到整条链路。
覆盖层必须写在 config.ts：store.ts 依赖 config.isMockMode()，反过来 import 会成环。
调用时机见 ai.refreshAiConfigCache()。**这条通道的落地状态：Phase 0 只有桩。**

## src/main/store.ts —— 负责人 P3
export function getToken(): Promise<string | null>
export function saveToken(token: string): Promise<void>
export function hasToken(): Promise<boolean>
export function getRepos(): Promise<Repo[]>
export function saveRepos(repos: Repo[]): Promise<void>
export function updateLocalState(fullName: string, state: Partial<LocalState>): Promise<void>
export function clearClonedPath(fullName: string): Promise<void>
export function clearClonedPaths(fullNames: string[]): Promise<void>
export function clearToken(): Promise<void>
export function getAiConfig(): Promise<AiConfigView>
export function saveAiConfig(patch: AiConfigPatch): Promise<void>
export function clearAiKey(): Promise<void>

说明：
- MOCK_MODE=true 时读写 starpilot.mock.db.json，否则读写 starpilot.db.json（避免污染真实数据）
- getRepos() 在读到的列表为空且 MOCK_MODE=true 时，用 mockStarred() 的结果做种子并落盘
- saveToken 优先用 Electron safeStorage 加密后存本地（base64 密文），禁止以任何形式把明文写入磁盘
- safeStorage.isEncryptionAvailable() 为 false（例如没装 keyring 的 Linux）时，token 只保存在主进程内存中、不写盘，重启后需在设置页重新填写
- clearToken 先写盘、再清内存（与 saveToken 相反），保证拿不到「磁盘上还有、内存已清」的中间态；不清 reposCache
- clearClonedPath / clearClonedPaths 只删 local.cloned_path，其余 local 字段（fork 标记等）原样保留。
  必须是独立函数：updateLocalState 会显式过滤掉值为 undefined 的键，所以
  「updateLocalState(f, { cloned_path: undefined })」清不掉任何东西，而 Electron IPC 的
  结构化克隆和 JSON.stringify 也都会丢掉 undefined。clearClonedPaths 一次只写一遍盘，
  且**不**用 saveRepos(整个新数组) 实现，否则会覆盖并发写入。
- ⚠️ 语义边界：既然 cloned_path 是可以被静默清掉的，那**「读到一条不存在的路径」就等同于
  「这条记录已经作废」**，两者不能同时成立。因此任何「写入假路径再断言能读回」的测试都会
  与 local:pruneClones 冲突。对账发生在渲染进程 load() 那一层，getRepos() 本身不做对账。

AI 配置三条（getAiConfig / saveAiConfig / clearAiKey）**与上面 token 三件套刻意对称**：
存储与加密都落在本文件，所以走 store: 命名空间而不是 ai:。密钥的存法照抄
saveToken 的范式——safeStorage 可用就写 base64 密文并清掉内存副本，不可用就
**一个字节都不写盘**、只留内存；clearAiKey 与 clearToken 一样**先写盘再清内存**，
免得「写盘失败但内存已清」把会话悄悄复活。baseUrl / model 不是秘密，明文存。
`AiConfigPatch.apiKey` 只进不出：有值就写，缺省表示"不动现有的 key"，清空要走 clearAiKey
（传空串会被当作非法值拒绝，与 saveToken 一致）。

⚠️ **AiConfigView 里没有 apiKey 字段，这是有意的**：契约层面就杜绝回传明文，
界面上"不回显 key"因此不靠调用方自觉。往这个类型里加字段之前，先读这段。
（落地状态：Phase 0 只有桩，三个函数都抛「尚未实现」。）

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
export function clone(fullName: string, targetDir: string): Promise<string | null>
export function openDir(path: string): Promise<void>
export function getCloneProgress(fullName: string): CloneProgress | null
export function cancelClone(fullName: string): boolean
export function removeClone(fullName: string, path: string): Promise<string | null>
export function listMissingCloneRecords(repos: Repo[]): Promise<string[]>

说明：MOCK_MODE=true 时 openDir 仍然走真实实现（shell.openPath），
因为演示前会预先 clone 好仓库，"打开目录"必须真的能打开。

getCloneProgress 是**同步的内存查询**，给渲染进程在 clone 进行中按固定间隔轮询用。
返回 null 表示该仓库当前没有进行中的克隆，界面据此不画进度条。
数据来自 simple-git 的 progress 回调（本仓库的 git 会在 stderr 上报
"Receiving objects: 47% (1234/2624)"），stage 为 null 表示 clone 已启动但 git
还没吐出第一行；elapsedMs 在每次读取时现算，不在写进度时算死（git 在 counting /
resolving 阶段可能十几秒不吭声，算死的话界面的秒数会冻住）。
MOCK_MODE=true 时不产生任何记录（全项目只有 mock.ts 一个假数据源，这里不另造假进度）。

cancelClone 返回 true = 确实中止了一个在跑的克隆，false = 本来就没人跑。**false 不是错误**：
界面认为在跑、主进程这边其实已经结束了，这属于正常竞态，所以不抛错。撤销手段只有一条路——
simple-git 4.0.2 的 abort 是**构造期**选项（`simpleGit({ progress, abort: controller.signal })`），
不能传给 .clone()；内部是 `child.kill('SIGINT')`，**不是树杀**。中止后目标目录由 clone 自己的
catch 里调 cleanupPartialClone 清掉：cloned_path 只在 clone 成功返回后才写进 store，取消永远
走不到那一行，所以后续的磁盘对账救不了它。取消时 clone() 返回 **null**（静默成功），
不是抛错——渲染进程因此不必对 IPC 回来的错误文本做子串匹配，类型系统替我们守着。

⚠️ clone 的 `Promise<string | null>` 是这一版**刚定的**签名：`null` = 已取消。
在取消克隆那个 PR 落地之前，现有实现只会返回路径、从不返回 null，
但契约先按最终形态写死，免得两个相位各写一半。
（落地状态：Phase 0 的 cancelClone 是恒返回 false 的桩。）

removeClone 是本项目唯一会真正删除用户文件的地方，闸门顺序本身即正确性，不要重排：
① 先用 lstat 判存在性，不存在就当"已删除"返回 null（必须最先，否则会先撞上"不是 git 工作树"）；
② 只删目录、且顶层不能是符号链接；③ realpath 解析后，字符串路径与真实路径**各自**过一遍
"不是文件系统根 / 不是 home / 不是 home 的祖先"——中间路径是 symlink 时只有 realpath 看得穿；
④ basename(realpath) 必须等于仓库名（有 .git 只能证明"这是个 git 仓库"，
   证明不了"这是 StarPilot 克隆的那份"，没有这条会把 ~/Documents 这类目录整个删掉）；
⑤ 真实模式要求工作树里有 .git，**mock 模式不跳过校验**，改为要求路径位于
   <downloads>/StarPilotDemo 之内（mock 的 clone 不建 .git）。
返回值是**实际被删掉的路径**（没删成返回 null），供调用方拿去做提示。

listMissingCloneRecords 做对账，返回"记录里有、磁盘上却没有"的 fullName 列表。
父目录启发式：目标不存在但父目录还在 → 用户确实删了，清记录；父目录也不在 → 多半是
外接盘/网络盘没挂载，跳过。内部是异步 stat：路径挂在已断开的 NFS 挂载点上时，
同步 stat 会把主进程连同整个 UI 一起冻住几十秒，而那恰好是它要处理的场景。

## src/main/ai.ts —— 负责人 P2
export function summarize(readme: string): Promise<string>
export function classify(repo: Repo): Promise<AiCategory>
export function enrichRepos(repos: Repo[]): Promise<Repo[]>
export function generateReport(repos: Repo[]): Promise<string>
export function refreshAiConfigCache(): void
export function testConnection(): Promise<AiConnectionResult>

说明：enrichRepos 内部用 p-limit 3 并发跑 summarize + classify，
结果写回 store.saveRepos() 并返回完整列表（前端只调一次，不要在前端循环调用）。

refreshAiConfigCache 读 store 里存的 AI 配置再调 config.setAiOverride，是**同步**的。
调用点有三处：app.whenReady() 启动时一次、store:saveAiConfig 与 store:clearAiKey 两条
handler 各一次。之所以把刷新挂在 handler 里而不是只挂启动路径，是为了不依赖
「先启动、再配置」这个顺序——否则用户填完 key 必须重启才生效。它是幂等的、不抛错。
**绝不能拿 summarize 当连接探针**：summarize 在失败时静默降级成空串（catch 里 return ''），
探针会永远"成功"。testConnection 走一次 `max_tokens: 1` 的极简 chat 调用，把错误
**分类成人话**（未配置 key / 连不上 baseUrl / key 无效 / baseUrl 或 model 不对），
以 `{ ok: false, message }` 正常返回而**不抛错**，设置页直接渲染 message 即可。
MOCK_MODE=true 时不发真实请求，直接返回「Mock 模式不发起真实请求」。
（落地状态：Phase 0 只有桩——refreshAiConfigCache 是空函数，testConnection 抛「尚未实现」。）

## src/main/ai-prompts.ts —— 负责人 P2
export function summarizePrompt(readme: string): string
export function classifyPrompt(repo: Repo): string
export function reportPrompt(repos: Repo[]): string

说明：把三处提示词从 ai.ts 里抽出来，做成**纯函数**（无 IO、无副作用、不读环境），
这样能离线断言 prompt 内容（例如 classify 的 prompt 必须含全部 7 个枚举、
周报 prompt 必须含「不得编造仓库」），不需要起进程。
⚠️ 抽出去以后最容易出的问题是**prompt 与解析器漂移**：比如把 classify 的 prompt 改成
只回单词，而 ai.ts 的 extractContent 还在按 `"category":` 键找。两个契约写在同一个
注释块里，并且解析器对「裸词」与「JSON」两种输出都要兼容。
硬约束不变：不用 response_format（第三方中转会 400）、分类必须落在 7 枚举内、
generateReport 任何失败都要返回兜底文案、绝不抛错。

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
