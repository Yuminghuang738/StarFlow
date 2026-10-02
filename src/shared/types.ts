// ============================================================
// 全局数据结构契约（冻结）
// 冻结契约：不要随意修改本文件。
// 其他人需要新字段请在 PR 描述里提出，不要自己加。
// ============================================================

export interface Repo {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  /** ISO 8601，来自 Accept: application/vnd.github.star+json */
  starred_at: string;
  topics: string[];
  pushed_at: string | null;
  /** 只保存最新一条 Release（取 fetchReleases() 返回数组的第 0 条），不是数组 */
  latest_release: Release | null;
  ai_summary?: string;
  ai_category?: AiCategory;
  local?: LocalState;
}

export interface LocalState {
  /** clone 到的本地路径 */
  cloned_path?: string;
  /** fork 后的仓库全名，如 "zhangsan/repo" */
  forked_full_name?: string;
  /** ISO 8601 */
  forked_at?: string;
}

export interface Release {
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
}

export interface Commit {
  sha: string;
  message: string;
  date: string;
  html_url: string;
}

/** AI 分类枚举，固定 7 个，不允许自由发挥 */
export type AiCategory =
  | 'AI/ML'
  | '前端'
  | '后端'
  | 'DevOps'
  | '工具'
  | '学习资源'
  | '其他';

/** 运行时校验用的分类全集（ai.ts 必须只返回其中之一，UI 筛选用同一个数组） */
export const AI_CATEGORIES: readonly AiCategory[] = [
  'AI/ML',
  '前端',
  '后端',
  'DevOps',
  '工具',
  '学习资源',
  '其他',
] as const;

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  newStars: Repo[];
  languageStats: Record<string, number>;
  dailyStarCount: Record<string, number>;
  topRepos: Repo[];
  aiSummary: string;
}

// ============================================================
// 登录（GitHub OAuth Device Flow）
// ============================================================

/** 来自 GET https://api.github.com/user —— 沿用 GitHub 的 snake_case */
export interface AuthUser {
  login: string;
  avatar_url: string | null;
  name: string | null;
}

export interface DeviceFlowInfo {
  userCode: string;
  verificationUri: string;
  /** 剩余有效秒数（每次返回时重算），不是 GitHub 原始的 expires_in */
  expiresIn: number;
}

export interface AuthState {
  /** false = MOCK 模式或未配置 client id，此时不展示登录按钮，只展示 reason */
  available: boolean;
  reason: string | null;
  /**
   * 还在进行中的设备流。渲染进程 reload 会丢掉挂起的 waitForLogin，
   * 但主进程的流程要继续活着（用户正在浏览器里操作），靠这个字段恢复 UI。
   */
  pending: DeviceFlowInfo | null;
}

/**
 * 登录终态。cancelled / expired / error 都算正常结局，走 data 返回，
 * 不走 IpcResult 的 error 分支——否则前端 unwrap() 会弹一条错误的 toast。
 */
export type LoginOutcome =
  | { status: 'success'; user: AuthUser }
  | { status: 'cancelled' }
  | { status: 'expired' }
  | { status: 'error'; message: string };

/**
 * 「当前登录的是谁」以及**为什么没拿到**。
 *
 * 为什么不直接回 AuthUser | null：token 是唯一长期存在的东西，AuthUser 只在登录成功
 * 那一刻作为 LoginOutcome 回来过一次，重启之后就没有了——所以侧边栏的账号块只能拿
 * token 现取一次。而"没拿到"有三种完全不同的含义，混成一个 null 之后界面就没法说实话：
 *   no-token    本来就没登录（该显示「未登录」并给登录入口）
 *   unavailable 没配 OAuth Client ID / Mock 模式（该显示 reason，**不该**给一个点不动的登录按钮）
 *   error       有 token 但这次没取到（网络 / token 已失效）——要说出来，不能装作没登录
 */
export interface GithubViewer {
  user: AuthUser | null;
  reason: 'no-token' | 'unavailable' | 'error' | null;
  /** reason 的人话说明；正常取到账号时为 null */
  detail: string | null;
}

// ============================================================
// Clone 进度
// ============================================================

/**
 * 一次 clone 的实时进度。数据来自 git 自己打的进度行
 * （"Receiving objects: 47% (1234/2624)"），由主进程解析后缓存，
 * 渲染进程按固定间隔轮询取——本项目全链路只有 invoke，主进程没有
 * 主动推给渲染进程的机制，所以进度只能"拉"不能"推"。
 */
export interface CloneProgress {
  /**
   * git 上报的阶段名：receiving / resolving / counting / compressing …
   * 为 null 表示 clone 已经启动、但 git 还没吐出第一行进度。
   */
  stage: string | null;
  /** 0–100。**只有 stage 非 null 时才有意义**，此时才该画确定态进度条 */
  percent: number;
  /** 已处理 / 总共的对象数（不是字节数，git 的进度行给的就是对象计数） */
  processed: number;
  total: number;
  /** 从 git clone 真正开始算起的毫秒数，不含前面弹目录选择框的时间 */
  elapsedMs: number;
}

// ============================================================
// 本地 clone 的同步状态（落后上游多少 + 更新）
//
// 只存在于内存，**不进 LocalState、不落盘**：重启后一切回到 'unchecked'。
// 判据见 src/main/localSync.ts（纯函数，判定顺序本身就是正确性）。
// ============================================================

export type LocalSyncState =
  /** 本次会话从未检查过。只由渲染进程合成，主进程从不返回这个值 */
  | 'unchecked'
  | 'up-to-date'
  | 'behind'
  | 'ahead'
  /** 本地与上游都有对方没有的提交，fast-forward 永远做不了 */
  | 'diverged'
  /** 当前分支没有跟踪分支（@{u} 解析不出来） */
  | 'no-upstream'
  /** 游离 HEAD，没有分支可快进 */
  | 'detached'
  /** 记录里有 cloned_path，磁盘上已经没有这个目录 */
  | 'missing-on-disk'
  /** 目录存在，但不是 git 工作树 */
  | 'not-git'
  /** 目录名 ≠ 仓库名（被重命名 / 脏数据）。与 removeClone 的那道闸门同源 */
  | 'path-mismatch'
  /** git 未安装 / 网络不通 / 权限等，探测本身失败 */
  | 'error'

/**
 * 一个已 clone 仓库相对其上游的诚实状态。
 *
 * ⚠️ 未知一律用 null，**绝不用 0 / false 冒充**：
 * behind 为 0 的含义是"确实与上游齐平"，而"没查出来"必须是 null。
 * state 为 'error' 时 behind / ahead 必然是 null——fetch 失败后拿过期的
 * origin/* 引用算出来的数字，比没有数字更糟。
 */
export interface LocalSyncStatus {
  full_name: string
  state: LocalSyncState
  /** 当前分支名；detached / 探测失败时为 null */
  branch: string | null
  /** 形如 'origin/main' 的跟踪分支；无上游 / 未知时为 null */
  upstream: string | null
  /** 落后上游多少个提交；null = 未知 */
  behind: number | null
  /** 领先上游多少个提交；null = 未知 */
  ahead: number | null
  /**
   * 工作区有未提交 / 未跟踪的改动；null = 未知。
   * **与 state 正交**：behind + dirty 仍然是 behind（落后数照样是真的），
   * 只是「更新」会被拒绝——这样"落后多少"和"能不能更新"两件事不会互相掩盖。
   */
  dirty: boolean | null
  /** 这次探测完成的 ISO 时间；未检查为 null */
  checkedAt: string | null
  /** 中文补充说明（无上游的原因、探测错误原文等）；无则 null */
  detail: string | null
}

/**
 * 一次「更新」的结果。refused-* 是**预期内的拒绝**（本地有改动 / 已分叉 /
 * 无上游 / 游离 HEAD / 副本不在），不是失败：界面要把它说成"没动你的东西，
 * 原因是……"，而不是"更新失败"。
 */
export type LocalUpdateKind =
  | 'updated'
  /** fetch 成功，本来就没落后，什么都没做 */
  | 'up-to-date'
  | 'refused-dirty'
  | 'refused-diverged'
  | 'refused-no-upstream'
  | 'refused-detached'
  /** 副本不在 / 不是 git 工作树 / 目录名对不上——拒绝在无法确认的目录上动手 */
  | 'refused-path'
  /** fetch / merge / git 本身失败（网络、未安装 git、权限……） */
  | 'error'

export interface LocalUpdateOutcome {
  full_name: string
  kind: LocalUpdateKind
  /** 本次快进拉进来的提交数；其余情况为 0 */
  pulled: number
  /** 更新后重新探测的状态，供界面原地刷新徽章；探测失败为 null */
  status: LocalSyncStatus | null
  /** refused-* / error 的中文原因 */
  detail: string | null
}

// ============================================================
// AI 配置（OpenAI 兼容端点）
// ============================================================

/** 密钥的来源：界面里填的 / .env 里的 / 都没有。界面填的优先，.env 兜底 */
export type AiKeySource = 'store' | 'env' | 'none'

/**
 * 设置页要展示的 AI 配置视图。
 *
 * ⚠️ **这里刻意没有 apiKey 字段**：密钥只允许从渲染进程流向主进程，永不回传。
 * 界面只需要知道「配没配」（hasKey），以及两个本来就不是秘密的字段。
 * 想往这里加字段之前，先读 docs/module-signatures.md 里 store.ts 那节的 safeStorage 说明。
 */
export interface AiConfigView {
  hasKey: boolean
  baseUrl: string
  model: string
  source: AiKeySource
}

/**
 * 保存 AI 配置的入参。**只进不出**：apiKey 有值就写入，缺省表示「不动现有的 key」。
 * 要清除请走 store:clearAiKey，不要传空串——空串会被 store 当作非法值拒绝（与 saveToken 一致）。
 */
export interface AiConfigPatch {
  apiKey?: string
  baseUrl?: string
  model?: string
}

/**
 * 连接探针的结果。ok 为 false 时 message 是**已经分类过的**人话
 * （未配置 key / 连不上 baseUrl / key 无效 / baseUrl 或 model 不对），
 * 而不是原始异常文本——调用方直接渲染即可。
 */
export interface AiConnectionResult {
  ok: boolean
  message: string
  model: string
}

/**
 * AI 分类补全（enrich）的进行状态。由主进程在跑的过程中记录，渲染进程另开一条
 * 查询通道按固定间隔轮询——本项目全链路只有 invoke，没有 main→renderer 推送，
 * 进度只能"拉"不能"推"（与 CloneProgress 同一套路，见 types.ts 顶部那段说明）。
 *
 * 诚实性要求（本项目的验收线）：
 *  - `running === false` 时 done / total **一律为 0**，绝不保留上一次的 100%——
 *    渲染进程跑完后再问一次必须读到"没在跑"，不能停在满格上冒充"这次跑完了"。
 *  - `total === 0` 表示总数还未知（主进程尚未开始记录），此时渲染进程**不许**
 *    拿 0 冒充进度，只能显示不带数字的"补全中"。
 */
export interface AiEnrichProgress {
  /** 此刻有没有一批 enrich 在跑 */
  running: boolean
  /** 已完成的仓库数。running 为 false 时恒为 0 */
  done: number
  /** 这一批要处理的仓库总数。0 表示还未知（尚未开始记录），不是"0 个" */
  total: number
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ============================================================
// 运行日志（捕获主进程 console）
//
// 只有主进程的 console 进来；渲染进程自己的 console 在开发者工具里看，
// 两边不共用一套缓冲。原因见 src/main/logBuffer.ts 的文件头。
// ============================================================

/** 主进程日志的一条记录。渲染进程自己的 console 不在这里面（那在开发者工具里看） */
export interface LogEntry {
  /** 本会话内单调递增。渲染进程据此判断"有没有新条目"，不靠时间戳比大小 */
  seq: number
  level: 'log' | 'info' | 'warn' | 'error'
  /** ISO 时间戳 */
  at: string
  /** 从消息开头的 [xxx] 解析出来的来源；没有就是 null */
  scope: string | null
  message: string
}

export interface LogSnapshot {
  /** 按时间正序，最多 LOG_BUFFER_LIMIT 条 */
  entries: LogEntry[]
  /** 本会话累计写入过多少条（含已被环状缓冲挤掉的） */
  total: number
  /** 因超出上限被挤掉的条数 */
  dropped: number
}
