// ============================================================
// 全局数据结构契约（冻结）
// 只有集成工程师（P7）可以修改本文件。
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

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
