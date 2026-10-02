# 主进程内部函数签名契约（冻结）

> 主进程各模块之间互相 import 的函数签名。**签名冻结，实现由各模块填充。**
> 骨架阶段这些函数体是"mock 分支 + throw NOT_IMPLEMENTED"，所以任何人都不阻塞。

## src/main/config.ts
export function isMockMode(): boolean
export function getEnv(): { openaiKey: string; openaiBaseUrl: string; modelName: string; githubToken: string; githubOauthClientId: string }
export function setAiOverride(patch: Partial<{ apiKey: string; baseUrl: string; model: string }>): void

说明：getEnv() 恒为同步、不读文件、不抛错。setAiOverride 写入的是模块级内存覆盖层，
getEnv() 里只有 openaiKey / openaiBaseUrl / modelName 三个字段会读它，
优先级是 **界面里填的 > .env > 空串**。之所以要有这么一层，是为了让 ai.client()
保持同步——它被四个导出函数同步调用，改成 async 会把 async 传染到整条链路。
覆盖层必须写在 config.ts：store.ts 依赖 config.isMockMode()，反过来 import 会成环。
调用时机见 ai.refreshAiConfigCache()。（覆盖层已完整落地，不再是桩。）
⚠️ `githubToken` 字段**没有任何调用方**，且返回形状冻结所以删不得：GitHub token 走
store.getToken()（应用内登录或设置页手填），`.env` 里的 GITHUB_TOKEN 不生效。

## src/main/store.ts
export function getToken(): Promise<string | null>
export function saveToken(token: string): Promise<void>
export function hasToken(): Promise<boolean>
export function getRepos(): Promise<Repo[]>
export function saveRepos(repos: Repo[]): Promise<void>
export function updateLocalState(fullName: string, state: Partial<LocalState>): Promise<void>
export function clearClonedPath(fullName: string): Promise<void>
export function clearClonedPaths(fullNames: string[]): Promise<void>
export function clearToken(): Promise<void>
export function getAiKey(): Promise<string | null>
export function getAiConfig(): Promise<AiConfigView>
export function saveAiConfig(patch: AiConfigPatch): Promise<void>
export function clearAiKey(): Promise<void>

说明：
- MOCK_MODE=true 时读写 starflow.mock.db.json，否则读写 starflow.db.json（避免污染真实数据）
- getRepos() 在读到的列表为空且 MOCK_MODE=true 时，用 mockStarred() 的结果做种子并落盘
- saveToken 优先用 Electron safeStorage 加密后存本地（base64 密文），禁止以任何形式把明文写入磁盘
- safeStorage.isEncryptionAvailable() 为 false（例如没装 keyring 的 Linux）时，token 只保存在主进程内存中、不写盘，重启后需在设置页重新填写
- getToken() 在密文解不开时（换机器 / keyring 变更）降级返回 null，**那是它那一侧的取舍**：
  它的调用方 github.client() 只关心"发不发得出请求"，两种情况没有区别
- hasToken() 问的却是另一个问题——「用户到底配过没有」——所以它在「文件里有密文、这一次
  却解不开」时**抛出可读错误**而不是返回 false。签名没变（它本来就为读盘失败抛错），
  渲染进程那套三态徽章直接接住：IPC 回 { ok: false } → 设置页显示「读不到」+ 原因 + 重试。
  返回 false 仍然只表示一件事：**确实没配过**（文件里没有 token、内存里也没有）
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
（落地状态：已全部实现，不再是桩。`getAiKey` 是**主进程内部**读明文的口子
（`ai.refreshAiConfigCache` 用），绝不能让它的返回值流向渲染进程——跨进程的视图
只有 `getAiConfig`，而那个类型里没有 apiKey。它的解密失败降级成 null，于是
`getAiConfig` 会报 `source: 'none'`（界面显示「未配置」），这与"确实没配过"
分不开——要分开就得给 AiConfigView 加字段，属于动契约，暂时维持。）

## src/main/mock.ts
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
export function mockLocalSync(fullName: string): LocalSyncStatus
export function mockUpdateLocal(fullName: string): LocalUpdateOutcome
export function mockReportSummary(repos: Repo[]): string

说明：mock.ts 是唯一的假数据源，内部维护一份内存态 starred 列表：
unstar 从内存列表移除、fork 写 local.forked_full_name，因此刷新后不会"复活"。

mockLocalSync / mockUpdateLocal 是 local:checkUpdates / local:updateClone 在
MOCK_MODE 下的委派目标（local.ts 自己不伪造 git 数据——全项目只有这里一个假数据源）。
状态由 stableHash(full_name) % 6 确定性选出，六种分支：最新 / 落后 / 落后且脏 /
领先 / 分叉 / 无上游；mockUpdateLocal 对一个"落后且不脏"的仓库会把它记进
mockUpdated 集合，之后再问就是"已是最新"（同一次会话内幂等，刷新后重置）。

## src/main/github.ts
export function fetchStarred(): Promise<Repo[]>
export function fetchReadme(fullName: string): Promise<string>
export function fetchReleases(fullName: string): Promise<Release[]>
export function fetchCommits(fullName: string): Promise<Commit[]>
export function unstar(fullName: string): Promise<void>
export function fork(fullName: string): Promise<Repo>

## src/main/local.ts
export function chooseDir(): Promise<string | null>
export function clone(fullName: string, targetDir: string): Promise<string | null>
export function openDir(path: string): Promise<void>
export function getCloneProgress(fullName: string): CloneProgress | null
export function cancelClone(fullName: string): boolean
export function removeClone(fullName: string, path: string): Promise<string | null>
export function listMissingCloneRecords(repos: Repo[]): Promise<string[]>
export function checkLocalSync(fullName: string, path: string): Promise<LocalSyncStatus>
export function checkAllLocalSync(repos: Repo[]): Promise<LocalSyncStatus[]>
export function updateLocalClone(fullName: string, path: string): Promise<LocalUpdateOutcome>

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
落地状态：已完成——`clone` 会在用户取消时返回 null，`cancelClone` 也真的会中止
正在跑的 clone（按 fullName 查 AbortController，返回 `true` 表示确实中止了；
`false` 只表示"那一刻没有人在跑"，是正常竞态，渲染进程不当失败处理）。

removeClone 是本项目唯一会真正删除用户文件的地方，闸门顺序本身即正确性，不要重排：
① 先用 lstat 判存在性，不存在就当"已删除"返回 null（必须最先，否则会先撞上"不是 git 工作树"）；
② 只删目录、且顶层不能是符号链接；③ realpath 解析后，字符串路径与真实路径**各自**过一遍
"不是文件系统根 / 不是 home / 不是 home 的祖先"——中间路径是 symlink 时只有 realpath 看得穿；
④ basename(realpath) 必须等于仓库名（有 .git 只能证明"这是个 git 仓库"，
   证明不了"这是 StarFlow 克隆的那份"，没有这条会把 ~/Documents 这类目录整个删掉）；
⑤ 真实模式要求工作树里有 .git，**mock 模式不跳过校验**，改为要求路径位于
   <downloads>/StarFlowDemo 之内（mock 的 clone 不建 .git）。
返回值是**实际被删掉的路径**（没删成返回 null），供调用方拿去做提示。

listMissingCloneRecords 做对账，返回"记录里有、磁盘上却没有"的 fullName 列表。
父目录启发式：目标不存在但父目录还在 → 用户确实删了，清记录；父目录也不在 → 多半是
外接盘/网络盘没挂载，跳过。内部是异步 stat：路径挂在已断开的 NFS 挂载点上时，
同步 stat 会把主进程连同整个 UI 一起冻住几十秒，而那恰好是它要处理的场景。

checkLocalSync / checkAllLocalSync / updateLocalClone 是「本地副本落后上游多少 +
快进更新」三个入口，**判定逻辑本身在 localSync.ts**（纯函数，见下），这里只负责
把磁盘上的事实探出来、以及真的执行 git 命令。

- checkLocalSync：**不抛错**，失败编码进 LocalSyncStatus（git 没装 / 网络不通 /
  不是工作树都各是一种 state）。detached 与 no-upstream **不发 fetch**——没有
  上游就没有可 fetch 的对象，发了也只是一次白跑的等待。fetch 失败时**绝不用过期的
  `origin/*` 引用算一个落后数**，直接 state:'error' + detail（这是本功能最容易
  "安静说谎"的一处）。
- checkAllLocalSync：内部 p-limit 3（与 enrichRepos 同一约定），只处理有
  cloned_path 的仓库，单个仓库失败不拖垮整批（失败以一条 state:'error' 的结果出现）。
- updateLocalClone：**先按本地事实拒绝**（副本不在 / 目录名不符 / 游离 HEAD /
  无上游 / 分叉 / 有未提交改动），能更新才 fetch，fetch 后**重算** behind（远端可能
  在检查之后又动了），behind 为 0 → up-to-date，否则 `git merge --ff-only @{u}`。
  **只做快进**：绝不生成 merge 提交、绝不覆盖用户改动；拒绝是一种正常结局
  （kind 为 `refused-*`），不是失败。全程不写 store。
- 路径一律由 index.ts 从 store 里查出来再传进来（与 removeClone 同一条约定：
  渲染进程永远交不出任意路径）。
- MOCK_MODE 下两个入口都委派给 mock.ts 的 mockLocalSync / mockUpdateLocal，
  **完全不碰 simpleGit**（自检断言 zero raw calls）。
- 结果**不落盘**：LocalState 一个字段都没加，进程重启后界面如实显示「未检查」。

## src/main/localSync.ts
export interface SyncProbe
export interface SyncClassification
export function classifyLocalSync(probe: SyncProbe): SyncClassification
export type UpdateDecision
export function decideUpdate(probe: SyncProbe): UpdateDecision
export function parseAheadBehind(raw: string): { ahead: number; behind: number } | null

说明：**零 git 依赖的纯函数模块**（只 import @shared/types，不碰 Node / electron /
simple-git），所以自检可以直接喂各种事实组合进去断言，不需要真的有个仓库。
它存在的理由就是"判定顺序即正确性"——这段顺序放在 local.ts 里会被 IO 淹没，
也就没法逐条钉住了。

classifyLocalSync 的判定顺序**不许重排**：
missing → path-mismatch → not-git → fatal → detached → no-upstream → fetchError →
ahead/behind 为 null → diverged → behind → ahead → up-to-date。
其中 **fetchError 必须排在 behind/ahead 之前**：否则一次联网失败会拿过期的
`origin/*` 引用算出一个"已是最新"，界面上一片祥和，用户以为查过了。

decideUpdate 返回判别式联合而不是字符串哨兵，顺序同样不许重排：
`diverged` 先于 `dirty`（分叉时快进永远不可能成功，说"你有本地改动"是把人引偏）；
`behind > 0` 时才看 dirty（behind 为 0 时工作区脏不脏与"要不要更新"无关，
那条脏信息仍留在 status 里由徽章显示为「已是最新 · 有本地改动」）；
`ahead > 0 && behind === 0` → up-to-date（本地多出来的提交不构成"要更新"）。

parseAheadBehind 解析 `rev-list --left-right --count` 的输出（`"0\t3"`，左=领先、
右=落后）。切不出**恰好两个非负整数**就返回 null，不猜——猜出来的数字会被当成真的
显示给用户。

## src/main/ai.ts
export function summarize(readme: string): Promise<string>
export function classify(repo: Repo): Promise<AiCategory>
export function normalizeCategory(text: string): AiCategory
export function enrichRepos(repos: Repo[]): Promise<Repo[]>
export function getEnrichProgress(): AiEnrichProgress
export function generateReport(repos: Repo[], releases?: RepoRelease[]): Promise<string>
export function analyzeCollection(digest: string): Promise<CollectionAnalysis>
export function planSearch(query: string): Promise<SearchPlan | null>
export function refreshAiConfigCache(): void
export function testConnection(): Promise<AiConnectionResult>

说明：enrichRepos 内部用 p-limit 3 并发跑 summarize + classify，
结果写回 store.saveRepos() 并返回完整列表（前端只调一次，不要在前端循环调用）。

getEnrichProgress 是**同步的内存查询**（返回副本），供渲染进程在补全进行中按固定
间隔轮询（IPC.AI_ENRICH_PROGRESS，见 README 的"只有 invoke"一节）。返回
`{ running, done, total }`：`done` 在每个仓库真正跑完之后 +1，不提前报数；
`total` 是本批收到的仓库数，**0 表示总数还未知**（不是"0 个仓库"）。
这批结束时（**成功、部分失败、整批抛错三种结局都算**）立即复位成
`{ running:false, done:0, total:0 }`——渲染进程在这条 invoke 返回后还会再问一次，
读到的必须是"没在跑"，绝不能停在满格上冒充"这次刚跑完"。MOCK_MODE 下不另造假进度
（全项目只有 mock.ts 一个假数据源）。

refreshAiConfigCache 读 store 里存的 AI 配置再调 config.setAiOverride，是**同步**的。
调用点有三处：app.whenReady() 启动时一次、store:saveAiConfig 与 store:clearAiKey 两条
handler 各一次。之所以把刷新挂在 handler 里而不是只挂启动路径，是为了不依赖
「先启动、再配置」这个顺序——否则用户填完 key 必须重启才生效。它是幂等的、不抛错。
**绝不能拿 summarize 当连接探针**：summarize 在失败时静默降级成空串（catch 里 return ''），
探针会永远"成功"。testConnection 走一次 `max_tokens: 1` 的极简 chat 调用，把错误
**分类成人话**（未配置 key / 连不上 baseUrl / key 无效 / baseUrl 或 model 不对），
以 `{ ok: false, message }` 正常返回而**不抛错**，设置页直接渲染 message 即可。
MOCK_MODE=true 时不发真实请求，直接返回「Mock 模式不发起真实请求」。
（落地状态：这一节现在**全部已实现**。早先那句"Phase 0 只有桩——refreshAiConfigCache 是
空函数、testConnection 抛尚未实现"早已不成立：refreshAiConfigCache 真的会读 store 再写
config 的覆盖层，testConnection 真的发一次 `max_tokens: 1` 的探针并分类错误。）

## src/main/ai-prompts.ts
export function summarizePrompt(readme: string): string
export function classifyPrompt(repo: Repo): string
export function reportPrompt(repos: Repo[], releases?: RepoRelease[]): string
export function collectionAnalysisPrompt(digest: string): string
export function searchPlanPrompt(query: string): string
export function parseSearchPlan(raw: string | null | undefined): SearchPlan | null
export const README_LIMIT: number
export const REPORT_REPO_LIMIT: number

说明：把三处提示词从 ai.ts 里抽出来，做成**纯函数**（无 IO、无副作用、不读环境），
这样能离线断言 prompt 内容（例如 classify 的 prompt 必须含全部 7 个枚举、
周报 prompt 必须含「不得编造仓库」），不需要起进程。
⚠️ 抽出去以后最容易出的问题是**prompt 与解析器漂移**：比如把 classify 的 prompt 改成
只回单词，而 ai.ts 的 extractContent 还在按 `"category":` 键找。两个契约写在同一个
注释块里，并且解析器对「裸词」与「JSON」两种输出都要兼容。
硬约束不变：不用 response_format（第三方中转会 400）、分类必须落在 7 枚举内、
generateReport 任何失败都要返回兜底文案、绝不抛错。

## src/main/report.ts
export function generate(): Promise<WeeklyReport>

说明：**同一份周报里有两个"周"，不要试图统一**——`weekStart` / `weekEnd` / `newStars`
是日历周（周一 00:00 UTC 起），而 `dailyStarCount` 的 7 个桶是**从今天往回数的滚动 7 天**
（与渲染进程 collectionStats 的 RECENT_WINDOW_DAYS 同一个窗口）。两者只有恰好周日才相等，
所以界面上那张图的标题写「最近 7 天」而不是「本周」。要改就两边一起改，否则同页两个"周"
会互相打脸。`generate()` 本身只读本地 store；只有 Release 那一段会打 GitHub（失败即跳过，
不影响周报主体，见 collectWeekReleases）。

## src/main/recommend.ts
export function similar(fullName: string): Promise<Repo[]>
export function forQuery(query: string): Promise<Repo[]>
export function forYou(offset?: number): Promise<RecommendForYou>
export function buildProfile(corpus: Repo[]): RecommendProfile
export function buildForYouQueries(profile: RecommendProfile, offset?: number): string[]
export function buildQuery(plan: SearchPlan | null, rawQuery: string): string
export function escapeQualifier(value: string): string

说明：三者都是**真实实现**（真实模式下走 Octokit 搜索，Mock 模式下走 mock.ts），
早先"真实模式仍是占位"的说法已不成立。
- `similar` 是「挑一个仓库当种子」的旧路径，通道与 preload 接口都保留着，但界面不再用它；
- `forYou` 用**整份收藏**的画像（buildProfile）拼几条查询，返回值里带 profile，页面据此
  把推荐理由摊开；结果会过滤掉已经 Star 过的仓库；
- `forQuery` 是「一句话找仓库」：AI 不可用时 planSearch 返回 null，buildQuery 直接拿
  原话去搜，不会因此不可用。

## src/main/tracker.ts
export function start(): void
export function stop(): void

说明：**真实模式下仍是占位**——两者都抛 `NOT_IMPLEMENTED`，只有 Mock 模式会真的用
node-cron 起一个每 5 分钟打一条日志的任务（演示用）。这是本仓库目前唯一未落地的模块。

## src/main/auth.ts
export function getState(): AuthState
export function startDeviceFlow(): Promise<DeviceFlowInfo>
export function waitForLogin(): Promise<LoginOutcome>
export function cancelDeviceFlow(): void
export function getViewer(): Promise<GithubViewer>
export function dispose(): void

说明：GitHub OAuth Device Flow（无需 client_secret，client id 来自环境变量
GITHUB_OAUTH_CLIENT_ID）。waitForLogin 只 resolve 不 reject，取消 / 超时 / 失败都算
正常结局，走 LoginOutcome 的 data 分支返回。token 绝不进渲染进程，LoginOutcome 只带
AuthUser。MOCK_MODE=true 时不提供该能力（AuthState.available 恒为 false），
因为 mock.ts 是全项目唯一的假数据源，这里不另造一套假的设备流。
dispose() 挂在 app.on('before-quit') 上，清掉挂起的轮询定时器。getViewer 是**后加的**：token 才是唯一长期存在的东西，AuthUser 只在登录成功那一刻
随 LoginOutcome 回来过一次——重启之后主进程手里只剩一条 token，而侧边栏的账号块
要显示头像与昵称。所以用 token 现查一次 `GET /user`。**不抛错**：三种"没拿到"按
GithubViewer.reason 如实区分（no-token 本来就没登录 / unavailable 没配 Client ID
或 Mock 模式 / error 有 token 但这次取不到），因为这是一条"页面挂载就会调"的通道，
抛错在前端 unwrap() 里只会变成一条用户什么也做不了的红 toast。401 单独换成人话
（「保存的 Token 已失效…重新登录一次即可」）——token 过期与"没登录"长得一模一样，
而用户的下一步动作完全不同。

## src/main/logBuffer.ts
export const LOG_BUFFER_LIMIT: number
export function installLogCapture(): void
export function getLogSnapshot(): LogSnapshot
export function clearLogs(): void

说明：主进程 console 的**展示用**内存环形缓冲，给界面「运行日志」页轮询取走
（IPC.LOG_TAIL / LOG_CLEAR）。之所以需要它：Electron 主进程的 console 只写到启动它的
终端，用户双击图标启动时根本没有终端可看。

三条边界（改这个文件之前先读，写在文件头部注释里）：
- **只镜像，不接管**：包装后的函数先记缓冲、再原样委托给原始实现（`console.log.bind(console)`
  捕获，不依赖调用方 this），终端里看到的东西必须**逐字不变**；记录这一步整个包在 try/catch 里，
  采集失败只丢这一条缓冲，绝不连累输出本身。
- **只收主进程**：渲染进程的 console 有自己的开发者工具，而且本项目只有 invoke、
  没有 main→renderer 推送，收不过来也没必要。
- **被挤掉的条数如实报**：`getLogSnapshot()` 的 `dropped` 原样交给界面显示「已丢弃 N 条」，
  悄悄吞掉会让「日志看起来是连续的」变成一句谎。上限 500 条，超限 shift 并累加 dropped。

另外两条实现约定：
- `record()` **只用数组操作、绝不调 console**，否则包装器调回自己就无限递归。
- `seq` 由模块级 `nextSeq` 单调递增，**`clearLogs()` 不重置它**：seq 的契约是「本会话内
  单调递增」，渲染进程靠它判断有没有新条目；清空后从头编号会让旧 seq 与新 seq 撞上，
  去重逻辑就会把刚来的新日志当旧的丢掉。`total` / `dropped` 则随 clearLogs 一起归零
  （界面上的「共 N 条」要能重置）。
- 拼行用 `util.inspect`（`[object Object]` 对排查毫无用处），并过一遍 `SECRET_RE` 脱敏：
  `ghp_…` / `github_pat_…` / `sk-…` 整体替换成 `***`，只替换 token 片段、不动其余文字——
  这一栏是要展示、要能被复制走的，主进程日志里恰恰会带上 Token 与 AI Key。
- `installLogCapture()` **幂等**（`installed` 标志），热重载或别的模块想确保已装时重复调用只装一次。
