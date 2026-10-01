# P7 · 集成工程师 —— 你的完整工作包

> **你是 7 人里唯一的集成工程师，也是唯一不写业务代码的人。**
> 你的活分四段，按顺序做：
>
> | 段落 | 时机 | 内容 |
> |---|---|---|
> | **Part A** | T+0，1.5 小时内 | 搭出「能跑的空壳」并推上 main。**其余 6 个人都在等你。** |
> | **Part B** | Part A 完成后 15 分钟 | 建 7 个 issue，把 p1~p6 的工作包发给 6 个人，宣布开工 |
> | **Part C** | T+8h 起 | 集成收口：关 Mock、端到端、录屏兜底 |
> | **Part D** | 全程 | 协作规则 + Wave 1 期间你不空闲该做的事 |
>
> ⚠️ 你是唯一允许修改 `src/shared/**`、`src/preload/**`、`src/main/index.ts`、`src/main/mock.ts`、
> `package.json`、`.github/**` 的人。这既是权力也是责任：**别人提 PR 动了这些文件，你要拦下来。**

---

# Part A · Wave 0：搭建骨架

## 0. 怎么用这份文件

1. **新开一个 AI 会话**，按 P0.1 → P0.9 顺序发提示词。**建议全程同一个会话**（契约上下文一致，AI 不会前后矛盾）。
2. 每次新开会话时，先发**第 2 节《通用约束》**，再发**第 3 节起**对应编号的提示词（P0.1 在第 3 节、P0.2 在第 4 节，依次类推）。
3. 每步做完**立刻执行该步的"完成后必做"**命令，绿了再 commit，红了的报错原样贴回给 AI 继续修。**不要攒着一起调**。
4. 从 P0.2 起，后续每一步都要把 `src/shared/types.ts`、`src/shared/ipc.ts` 的**真实全文**附在提示词后面（文件末尾的 `【附：xxx 全文】` 就是留给你贴的位置）。做 P0.6 / P0.7 时，再把 `docs/module-signatures.md` 一起附上；做 P0.8 时附 `docs/renderer-contracts.md`。
5. **第 14 节《已知坑》是真实查证过的版本冲突，不要在提示词里删掉**——AI 最大的毛病就是"顺手升到 latest"。
6. P0.5（mock 数据）不依赖任何东西，可以第一个做，做完再回头做 P0.1 也完全可以。

### 执行顺序

| 步骤 | 产出 | 依赖 |
|---|---|---|
| P0.1 | 工程脚手架，`npm run dev` 能开空窗 | 无 |
| P0.2 | 三层冻结契约（shared 2 个 + docs 2 个） | P0.1 |
| P0.3 | `preload/index.ts`（一次写完，不再动） | P0.2 |
| P0.4 | 统一 Mock 层 `mock.ts` | P0.2 |
| P0.5 | `mock-data.json`（≥24 条真实仓库） | 无（可最先做） |
| P0.6 | 7 个主进程 stub + `config.ts` | P0.2 P0.4 P0.5 |
| P0.7 | `main/index.ts`（22 个 handler 全注册） | P0.2 P0.3 P0.6 |
| P0.8 | 渲染进程骨架 + 4 个冻结签名 | P0.3 |
| P0.9 | CI / CODEOWNERS / PR 模板 / README | P0.1 |
| P0.10 | 骨架自检（让 AI 复查） | 全部 |

---

## 1. 版本锁定表

**这张表是真机查过 registry 得出的，AI 不得自行修改任何一个版本号。** 理由见第 5 节。

| 包 | 版本 | 位置 |
|---|---|---|
| electron | `^44.5.1` | dev |
| electron-vite | `^5.0.0` | dev |
| vite | `^7.3.6` | dev |
| @vitejs/plugin-react | `^5.2.0` | dev |
| electron-builder | `^26.15.3` | dev |
| typescript | `^5.9.3` | dev |
| @types/node | `^22.20.4` | dev |
| @types/react | `^19.3.0` | dev |
| @types/react-dom | `^19.3.0` | dev |
| eslint | `^9.39.5` | dev |
| typescript-eslint | `^8.71.0` | dev |
| eslint-plugin-react-hooks | `^7.1.1` | dev |
| prettier | `^3.6.2` | dev |
| tailwindcss | `^3.4.19` | dev |
| postcss | `^8.5.28` | dev |
| autoprefixer | `^10.6.1` | dev |
| react | `^19.3.0` | dependencies |
| react-dom | `^19.3.0` | dependencies |
| zustand | `^5.0.15` | dependencies |
| echarts | `^6.1.0` | dependencies |
| echarts-for-react | `^3.0.6` | dependencies |
| octokit | `^5.0.5` | dependencies |
| openai | `^7.25.0` | dependencies |
| lowdb | `^7.0.1` | dependencies |
| simple-git | `^4.0.2` | dependencies |
| node-cron | `^4.6.0` | dependencies |
| p-limit | `^3.1.0` | dependencies |
| dotenv | `^18.0.5` | dependencies |

> `react` / `echarts` / `zustand` 放 `dependencies` 是刻意选择：渲染进程由 Vite 打包，放哪边都能跑，放 `dependencies` 更不容易出 "module not found"。黑客松不关心包体积。

---

## 2. 通用约束（每次新开会话先发这一段）

```text
你是一位 Electron + TypeScript 专家，正在为一个叫 StarPilot 的黑客松项目搭建工程骨架。

【项目定位】
跨平台（Windows/Linux）桌面应用，管理 GitHub Star 过的仓库：浏览/筛选/AI 分类/周报/推荐。

【技术栈（版本已锁死，禁止修改或升级任何版本号）】
electron ^44.5.1 / electron-vite ^5.0.0 / vite ^7.3.6 / @vitejs/plugin-react ^5.2.0
electron-builder ^26.15.3 / typescript ^5.9.3 / @types/node ^22.20.4
react ^19.3.0 / react-dom ^19.3.0 / zustand ^5.0.15 / echarts ^6.1.0 / echarts-for-react ^3.0.6
tailwindcss ^3.4.19 / postcss ^8.5.28 / autoprefixer ^10.6.1
eslint ^9.39.5 / typescript-eslint ^8.71.0 / eslint-plugin-react-hooks ^7.1.1 / prettier ^3.6.2
主进程运行时：octokit ^5.0.5 / openai ^7.25.0 / lowdb ^7.0.1 / simple-git ^4.0.2
node-cron ^4.6.0 / p-limit ^3.1.0（必须是 3.x）/ dotenv ^18.0.5

【铁律，违反视为失败】
1. 主进程（src/main）与 preload 使用 ESM（package.json 里 "type": "module"）。
2. 渲染进程禁止 import 任何 src/main/** 代码，禁止 require，禁止使用 process / __dirname / fs 等 Node API。
3. 所有跨进程调用必须走 window.api.xxx（contextBridge 暴露）。
4. contextIsolation: true、nodeIntegration: false、sandbox: false。禁止 remote 模块。
5. Tailwind 用 v3 的配置方式（tailwind.config.js + postcss.config.js），不要用 v4 的 CSS-first 配置，不要用 @tailwindcss/postcss。
6. 不要跑任何交互式 CLI 初始化（如 npx shadcn init / npx tailwindcss init -p），所有配置文件手写。
7. 不要用省略号，不要写"其余代码不变"。每个文件都要输出完整内容。
8. 只输出代码和必要的一句话说明，不要长篇解释，不要输出"总结""建议"。
9. 如果发现缺少信息或需要新增字段，不要自己发挥，在最后单列一行：
   「需要集成工程师确认：xxx」

【输出格式】
按文件逐个输出，每个文件用单独的代码块，代码块前一行用 `// file: 相对路径` 标明路径。
```

---

## 3. P0.1 工程脚手架

**产出**：`package.json`、`tsconfig.json`、`electron.vite.config.ts`、`tailwind.config.js`、`postcss.config.js`、`eslint.config.js`、`.prettierrc`、`.gitignore`、`.env.example`、`src/renderer/index.html`、`src/renderer/src/env.d.ts`、`src/main/index.ts`（临时最小版）、`src/preload/index.ts`（临时最小版）、`src/renderer/src/main.tsx`（临时最小版）、`src/renderer/src/App.tsx`（临时最小版）

**完成后必做**：
```bash
npm install
npm run typecheck     # 必须 0 error
npm run lint          # 必须 0 error
npm run dev           # 必须能弹出一个 Electron 窗口，窗口里显示 StarPilot
```
```bash
git add -A && git commit -m "chore: 工程脚手架与版本锁定"
```

```text
请搭建 StarPilot 的工程脚手架。这是第一步，业务代码一律不要写。

【目录约定（electron-vite 标准）】
star-pilot/
├── src/
│   ├── main/index.ts          # 主进程入口（本轮只写临时的最小可运行版本）
│   ├── preload/index.ts       # 预加载（本轮只写临时的最小可运行版本）
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           └── env.d.ts
├── .env.example
├── electron.vite.config.ts
├── electron-builder.yml
├── eslint.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── .prettierrc

【package.json 要求】
- "name": "star-pilot"，"version": "0.1.0"，"private": true
- "type": "module"
- "main": "./out/main/index.js"
- dependencies 与 devDependencies 严格按下面给的内容，一个字都不要改，不要加任何其他包：
  dependencies:
    dotenv ^18.0.5
    echarts ^6.1.0
    echarts-for-react ^3.0.6
    lowdb ^7.0.1
    node-cron ^4.6.0
    octokit ^5.0.5
    openai ^7.25.0
    p-limit ^3.1.0
    react ^19.3.0
    react-dom ^19.3.0
    simple-git ^4.0.2
    zustand ^5.0.15
  devDependencies:
    @types/node ^22.20.4
    @types/react ^19.3.0
    @types/react-dom ^19.3.0
    @vitejs/plugin-react ^5.2.0
    autoprefixer ^10.6.1
    electron ^44.5.1
    electron-builder ^26.15.3
    electron-vite ^5.0.0
    eslint ^9.39.5
    eslint-plugin-react-hooks ^7.1.1
    postcss ^8.5.28
    prettier ^3.6.2
    tailwindcss ^3.4.19
    typescript ^5.9.3
    typescript-eslint ^8.71.0
    vite ^7.3.6
- scripts:
    "dev": "electron-vite dev"
    "build": "npm run typecheck && electron-vite build"
    "typecheck": "tsc --noEmit"
    "lint": "eslint ."
    "format": "prettier --write \"src/**/*.{ts,tsx,css,json}\""
    "build:win": "npm run build && electron-builder --win --config electron-builder.yml"
    "build:linux": "npm run build && electron-builder --linux --config electron-builder.yml"

【tsconfig.json 要求】
故意只用**一个** tsconfig（不用 project references，避免 composite 与 noEmit 冲突）。
compilerOptions:
  target ES2022, module ESNext, moduleResolution bundler,
  lib ["ES2022","DOM","DOM.Iterable"], jsx "react-jsx",
  strict true, noUnusedLocals false, noUnusedParameters false,
  noEmit true, resolveJsonModule true, esModuleInterop true,
  skipLibCheck true, isolatedModules true, allowSyntheticDefaultImports true,
  types ["node","vite/client"],
  baseUrl ".", paths { "@shared/*": ["src/shared/*"], "@/*": ["src/renderer/src/*"] }
include: ["src/**/*.ts","src/**/*.tsx","electron.vite.config.ts"]

【electron.vite.config.ts 要求】
- import { resolve } from 'node:path'
- import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
- import react from '@vitejs/plugin-react'
- main: plugins [externalizeDepsPlugin()]，alias '@shared' -> resolve('src/shared')
- preload: plugins [externalizeDepsPlugin()]，alias '@shared' -> resolve('src/shared')，
  并且 build.rollupOptions.output 设为 { format: 'es', entryFileNames: 'index.mjs' }
  （强制 preload 产物文件名，避免主进程里 preload 路径猜错）
- renderer: root 'src/renderer'，plugins [react()]，
  alias '@shared' -> resolve('src/shared'), '@' -> resolve('src/renderer/src')，
  build.rollupOptions.input = resolve('src/renderer/index.html')

【tailwind.config.js / postcss.config.js 要求】
- Tailwind v3 写法：content 覆盖 './src/renderer/index.html' 和 './src/renderer/src/**/*.{ts,tsx}'
- postcss.config.js 用 { tailwindcss: {}, autoprefixer: {} }（ESM：export default）

【eslint.config.js 要求（ESLint 9 flat config）】
- 用 typescript-eslint 的 recommended
- 全局忽略 out/ dist/ node_modules/
- **关键规则**：对 src/renderer/** 增加一段 override，禁止渲染进程碰主进程和 Node：
    'no-restricted-imports': ['error', { patterns: [
      { group: ['**/main/**', '@shared/../main/*'], message: '渲染进程禁止 import 主进程代码' },
      { group: ['fs','path','child_process','electron','node:*'], message: '渲染进程禁止使用 Node API，请走 window.api' }
    ]}]
    'no-restricted-globals': ['error', 'process', 'require', '__dirname', '__filename', 'Buffer']
- 对 src/main/** 增加 override：允许 node globals，关闭 react 相关规则
- 忽略 src/renderer/src/components/ui/** 里手写组件的 react-refresh 警告

【临时的最小可运行代码（本轮只求能开窗，下几步会整体替换）】
- src/main/index.ts：
  * 第一行必须是 import 'dotenv/config'
  * ESM 下用 fileURLToPath(import.meta.url) 推导 __dirname
  * createWindow()：BrowserWindow 宽 1280 高 860，
    webPreferences { preload: join(__dirname, '../preload/index.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  * dev 环境用 process.env['ELECTRON_RENDERER_URL'] 加载，生产用 loadFile(join(__dirname, '../renderer/index.html'))
  * 注册 window-all-closed / activate 常规生命周期
- src/preload/index.ts：暂时只 contextBridge.exposeInMainWorld('api', { ping: () => 'pong' })
- src/renderer/index.html：挂载点 <div id="root">，引入 ./src/main.tsx，标题 StarPilot
- src/renderer/src/main.tsx：React 19 的 createRoot 渲染 <App />
- src/renderer/src/App.tsx：显示一个居中的 "StarPilot" 字样和一句 "骨架就绪"，用 Tailwind 类
- src/renderer/src/env.d.ts：/// <reference types="vite/client" />
- src/renderer/src/index.css：@tailwind base / components / utilities 三行
  （main.tsx 里 import './index.css'）
- .env.example：
    OPENAI_API_KEY=
    OPENAI_BASE_URL=
    MODEL_NAME=
    GITHUB_TOKEN=
    MOCK_MODE=false
- .gitignore：node_modules/ out/ dist/ .env *.db.json
- electron-builder.yml：appId com.starpilot.app，productName StarPilot，
  files 包含 out/** 与 package.json，win target nsis，linux target AppImage
- .prettierrc：{ "singleQuote": true, "semi": false, "printWidth": 100 }
```

---

## 4. P0.2 三层冻结契约

**产出**：`src/shared/types.ts`、`src/shared/ipc.ts`、`docs/module-signatures.md`、`docs/renderer-contracts.md`

**完成后必做**：
```bash
npm run typecheck && npm run lint
git add -A && git commit -m "feat(shared): 冻结 types/ipc 契约与模块签名文档"
```

> 这一步的内容是**逐字给定**的，AI 只负责原样落地，不允许改写。

```text
请创建 StarPilot 的契约层文件。内容我已经逐字写好，请原样落地，不要改写、不要增删字段、不要调整格式风格。

【任务 1】创建 src/shared/types.ts，内容如下（含中文注释，原样保留）：

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

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

【任务 2】创建 src/shared/ipc.ts，内容如下（原样落地）：

// ============================================================
// IPC 通道名契约（冻结）
// 只有集成工程师（P7）可以修改本文件。
// ============================================================

export const IPC = {
  // GitHub 读写 —— 负责人 P1
  GITHUB_FETCH_STARRED: 'github:fetchStarred',
  GITHUB_FETCH_README: 'github:fetchReadme',
  GITHUB_FETCH_RELEASES: 'github:fetchReleases',
  GITHUB_FETCH_COMMITS: 'github:fetchCommits',
  GITHUB_UNSTAR: 'github:unstar',
  GITHUB_FORK: 'github:fork',

  // 本地 Git —— 负责人 P3
  LOCAL_CHOOSE_DIR: 'local:chooseDir',
  LOCAL_CLONE: 'local:clone',
  LOCAL_OPEN_DIR: 'local:openDir',

  // AI —— 负责人 P2
  AI_SUMMARIZE: 'ai:summarize',
  AI_CLASSIFY: 'ai:classify',
  AI_ENRICH_REPOS: 'ai:enrichRepos',
  AI_GENERATE_REPORT: 'ai:generateReport',

  // 存储 —— 负责人 P3
  STORE_GET_REPOS: 'store:getRepos',
  STORE_SAVE_REPOS: 'store:saveRepos',
  STORE_SAVE_TOKEN: 'store:saveToken',
  STORE_HAS_TOKEN: 'store:hasToken',
  STORE_UPDATE_LOCAL_STATE: 'store:updateLocalState',

  // 周报 —— 负责人 P4
  REPORT_GENERATE: 'report:generate',

  // 推荐 —— 负责人 P4
  RECOMMEND_SIMILAR: 'recommend:similar',

  // 定时追踪 —— 负责人 P4
  TRACKER_START: 'tracker:start',
  TRACKER_STOP: 'tracker:stop',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

【任务 3】创建 docs/module-signatures.md，内容如下（原样落地）：

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

【任务 4】创建 docs/renderer-contracts.md，内容如下（原样落地）：

# 渲染进程契约（冻结）

> P5（Dashboard）与 P6（App/Report/store）之间的接口。骨架阶段已给出可用实现，
> P6 负责加固，P5 直接消费。**签名不得修改。**

## src/renderer/src/store/repoStore.ts —— 负责人 P6
export interface RepoFilters {
  keyword: string;
  language: string | null;
  category: AiCategory | null;
  onlyCloned: boolean;
}

export interface RepoStore {
  repos: Repo[];
  loading: boolean;
  filters: RepoFilters;
  visibleRepos(): Repo[];
  setFilters(patch: Partial<RepoFilters>): void;
  load(): Promise<void>;
  refreshFromGitHub(): Promise<void>;
  enrich(): Promise<void>;
  unstar(fullName: string): Promise<void>;
  fork(fullName: string): Promise<void>;
  clone(fullName: string): Promise<void>;
  openDir(path: string): Promise<void>;
}

export const useRepoStore: UseBoundStore<StoreApi<RepoStore>>;

## src/renderer/src/lib/api.ts —— 负责人 P6
export function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T>
// 把 { ok: false } 转成 toast + throw Error(error)，调用方可以 try/catch

## src/renderer/src/components/common/ConfirmDialog.tsx —— 负责人 P6
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}
export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element

## src/renderer/src/components/common/Toast.tsx —— 负责人 P6
export interface ToastItem { id: string; type: 'success' | 'error'; message: string }
export function ToastProvider(props: { children: React.ReactNode }): React.JSX.Element
export function useToast(): { push(t: { type: 'success' | 'error'; message: string }): void }

【注意】不要创建除上述 4 个文件以外的任何文件，不要修改 shared/types.ts 或 shared/ipc.ts 的内容。
```

---

## 5. P0.3 preload 完整实现（一次写完，之后不再动）

**产出**：`src/preload/index.ts`、`src/preload/index.d.ts`

**完成后必做**：
```bash
npm run typecheck && npm run lint
git add -A && git commit -m "feat(preload): 暴露 window.api 完整签名"
```

```text
请完整实现 src/preload/index.ts 和 src/preload/index.d.ts。这是全项目最高优先级的文件，本轮一次性写完，之后不再改动。

【src/preload/index.ts 要求】
- 用 contextBridge.exposeInMainWorld('api', api) 暴露，api 对象结构严格如下
  （一共 **27 个方法**，与 ipc.ts 的 27 个通道一一对应）：
  github 6 + local 3 + ai 4 + store 6 + report 1 + recommend 1 + tracker 2 + auth 4 = 27
  （22 → 27 是后加的 GitHub OAuth Device Flow 登录，见 Part D）
  ⚠️ 最容易在抄写时被漏掉的是 ai.enrichRepos（因为它不在 guide.md 原契约里，是后加的），务必确认它在
- 每个方法就是 ipcRenderer.invoke(IPC.XXX, ...args)，**不做任何错误处理**，因为主进程已经统一包了 IpcResult
- 从 '@shared/ipc' 引入 IPC，从 '@shared/types' 引入类型

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { Repo, Release, Commit, AiCategory, LocalState, IpcResult } from '@shared/types'

const api = {
  github: {
    fetchStarred: (): Promise<IpcResult<Repo[]>> => ipcRenderer.invoke(IPC.GITHUB_FETCH_STARRED),
    fetchReadme: (fullName: string): Promise<IpcResult<string>> => ipcRenderer.invoke(IPC.GITHUB_FETCH_README, fullName),
    fetchReleases: (fullName: string): Promise<IpcResult<Release[]>> => ipcRenderer.invoke(IPC.GITHUB_FETCH_RELEASES, fullName),
    fetchCommits: (fullName: string): Promise<IpcResult<Commit[]>> => ipcRenderer.invoke(IPC.GITHUB_FETCH_COMMITS, fullName),
    unstar: (fullName: string): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.GITHUB_UNSTAR, fullName),
    fork: (fullName: string): Promise<IpcResult<Repo>> => ipcRenderer.invoke(IPC.GITHUB_FORK, fullName)
  },
  local: {
    chooseDir: (): Promise<IpcResult<string | null>> => ipcRenderer.invoke(IPC.LOCAL_CHOOSE_DIR),
    clone: (fullName: string, targetDir: string): Promise<IpcResult<string>> => ipcRenderer.invoke(IPC.LOCAL_CLONE, fullName, targetDir),
    openDir: (path: string): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.LOCAL_OPEN_DIR, path)
  },
  ai: {
    summarize: (readme: string): Promise<IpcResult<string>> => ipcRenderer.invoke(IPC.AI_SUMMARIZE, readme),
    classify: (repo: Repo): Promise<IpcResult<AiCategory>> => ipcRenderer.invoke(IPC.AI_CLASSIFY, repo),
    enrichRepos: (repos: Repo[]): Promise<IpcResult<Repo[]>> => ipcRenderer.invoke(IPC.AI_ENRICH_REPOS, repos),
    generateReport: (repos: Repo[]): Promise<IpcResult<string>> => ipcRenderer.invoke(IPC.AI_GENERATE_REPORT, repos)
  },
  store: {
    getRepos: (): Promise<IpcResult<Repo[]>> => ipcRenderer.invoke(IPC.STORE_GET_REPOS),
    saveRepos: (repos: Repo[]): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.STORE_SAVE_REPOS, repos),
    saveToken: (token: string): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.STORE_SAVE_TOKEN, token),
    hasToken: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IPC.STORE_HAS_TOKEN),
    updateLocalState: (fullName: string, state: Partial<LocalState>): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC.STORE_UPDATE_LOCAL_STATE, fullName, state)
  },
  report: {
    generate: (): Promise<IpcResult<WeeklyReport>> => ipcRenderer.invoke(IPC.REPORT_GENERATE)
  },
  recommend: {
    similar: (fullName: string): Promise<IpcResult<Repo[]>> => ipcRenderer.invoke(IPC.RECOMMEND_SIMILAR, fullName)
  },
  tracker: {
    start: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.TRACKER_START),
    stop: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IPC.TRACKER_STOP)
  }
}

contextBridge.exposeInMainWorld('api', api)

【src/preload/index.d.ts 要求】
- 定义并导出 interface StarPilotApi，字段与上面 api 完全一致
- declare global { interface Window { api: StarPilotApi } }
- 顶部加 export {} 保证是模块

【注意】
- 不要用 remote 模块
- 不要给 window.api 加 try/catch，不要把 IpcResult 拆开
- 不要暴露 ipcRenderer 本身
```

---

## 6. P0.4 统一 Mock 层

**产出**：`src/main/mock.ts`、`src/main/config.ts`

> 依赖 P0.5 的 `mock-data.json` 已存在。如果还没做 P0.5，先做 P0.5。

**完成后必做**：
```bash
npm run typecheck && npm run lint
git add -A && git commit -m "feat(main): 统一 Mock 层与运行配置"
```

```text
请实现 src/main/config.ts 和 src/main/mock.ts。这是全项目唯一的假数据来源，所有业务模块的 Mock 分支都调用它。

【src/main/config.ts —— 极简，不要加别的】
- export function isMockMode(): boolean  → process.env.MOCK_MODE === 'true'
- export function getEnv(): { openaiKey, openaiBaseUrl, modelName, githubToken } → 从 process.env 读取，缺失时返回空字符串
- 只做这两件事，不要读文件、不要抛错

【src/main/mock.ts 要求】
- import mockData from '../../mock-data.json'（tsconfig 已开 resolveJsonModule，electron-vite 会把它内联进 bundle，打包后也能用）
- mock-data.json 的结构是 { "repos": Repo[] }
- 模块级维护一份内存态列表 `let starred: Repo[] = structuredClone(mockData.repos)`，
  所有变更都改这份内存，保证 unstar 后刷新不会"复活"
- 导出以下 11 个函数，签名严格一致：

export async function mockStarred(): Promise<Repo[]>
  → 返回 structuredClone(starred)

export async function mockEnrich(repos: Repo[]): Promise<Repo[]>
  → 给每条补上 ai_summary 和 ai_category（用 mockClassify + 一段基于 description/language 拼的中文摘要，30 字以内）
  → 模拟一点耗时：await new Promise(r => setTimeout(r, 15))
  → 不要真的调用任何 LLM

export async function mockReadme(fullName: string): Promise<string>
  → 返回一段 markdown 字符串，包含 "# <fullName>"、简介、## 安装、## 使用 几节，内容用仓库本身的信息编，150 字左右

export async function mockReleases(fullName: string): Promise<Release[]>
  → 返回 3 条，tag_name 形如 v1.2.3 / v1.1.0 / v1.0.0，published_at 依次往前推 30 天

export async function mockCommits(fullName: string): Promise<Commit[]>
  → 返回 5 条，sha 用 7 位十六进制随机串，message 用常见的中英文提交信息，date 依次往前推 1 天

export function mockUnstar(fullName: string): void
  → 从 starred 里移除该仓库

export function mockFork(fullName: string): Repo
  → 找到该仓库，写入 local.forked_full_name = 'starpilot-demo/' + repoName 和 local.forked_at = new Date().toISOString()，返回更新后的 Repo

export async function mockSimilar(fullName: string): Promise<Repo[]>
  → 从 starred 里挑出 ai_category 或 language 相同的 4 条（排除自己），不足则用其他仓库补齐到 4 条

export function mockSummary(readme: string): string
  → 返回一句 30 字以内的中文摘要，内容跟 readme 无关也可以，稳定即可

export function mockClassify(repo: Repo): AiCategory
  → 按固定映射返回，保证结果稳定（不要随机）：
    language 为 Python/Go/C++/C 且 full_name 命中 AI 相关关键词 → 'AI/ML'
    language 为 JavaScript/TypeScript 且 topics 含 ui/react/vue/css → '前端'
    language 为 Go/Rust/C/Java 或 topics 含 server/database/api → '后端'
    topics 或 full_name 含 docker/k8s/kubernetes/ci/cd → 'DevOps'
    topics 或 full_name 含 awesome/roadmap/course/interview/learn → '学习资源'
    其他有 language 的 → '工具'
    完全没有 language 的 → '其他'
  → 返回值必须是 AI_CATEGORIES 里的值

export function mockReportSummary(repos: Repo[]): string
  → 返回一段 100 字以内的中文周报开头，提到本周新增数量最多的语言和 star 数最高的仓库

【约束】
- 严禁调用 octokit / openai / simple-git
- 不要在 mock.ts 里读写文件或数据库（本地持久化是 store.ts 的职责）
- 不要用 Math.random 影响 ai_category 的结果（分类必须稳定可复现）
```

---

## 7. P0.5 演示兜底数据

**产出**：`mock-data.json`（项目根目录）

**完成后必做**：
```bash
node -e "const d=require('./mock-data.json');console.log('条数',d.repos.length);console.log('语言',[...new Set(d.repos.map(r=>r.language))].length);console.log('分类',[...new Set(d.repos.map(r=>r.ai_category))].length);const w=d.repos.filter(r=>Date.now()-new Date(r.starred_at)<7*864e5).length;console.log('近7天',w)"
```
必须看到：条数 ≥24、语言 ≥8、分类 =7、近7天 ≥12。不满足就让 AI 补齐。
```bash
git add -A && git commit -m "chore: mock 兜底数据 31 条真实仓库快照"
```

```text
请生成项目根目录的 mock-data.json。这是演示兜底数据，必须真实、好看。
JSON 根结构：{ "repos": Repo[] }，Repo 的字段严格按 shared/types.ts，不要多字段不要少字段。

【硬性要求】
1. 条数：下面列出的 31 个仓库全部用上，一条不少。顺序按列表顺序，id 用递增的 1..31。
2. starred_at：**必须分散在最近 14 天内**，其中**至少 12 条的 starred_at 落在最近 7 天内**
   （否则周报的"本周新增"和 7 天趋势图会是空的，演示直接翻车）。
   用真实的 ISO 8601 带时区偏移的字符串，形如 "2025-09-28T14:32:11Z"，逐条错开不同小时。
3. 字段填充规则：
   - full_name / html_url / stargazers_count / language / topics / pushed_at / latest_release
     一律用这些仓库的**真实信息**，star 数量级要正确（不要全部写成 1000）
   - topics 每条 2~4 个，用小写英文短横线风格
   - description 用英文原文一句话；有 2~3 条故意写成 null（检验 null 处理）
   - pushed_at 用最近 3 个月内的 ISO 8601
   - latest_release：**一半给值一半给 null**。给值的填真实感 tag（如 "v1.2.3"）、
     published_at 用最近 3 个月内、html_url 指向 /releases/tag/<tag>
   - ai_summary 每条给一句 30 字以内的中文摘要
   - ai_category 按下面标注填（必须覆盖全部 7 个分类）
   - local 字段一律省略（不要出现），留下空让运行时写入
4. 不要出现任何省略号、注释、"..."占位或"以此类推"。

【31 个仓库清单（full_name | language | ai_category）】
huggingface/transformers | Python | AI/ML
langchain-ai/langchain | Python | AI/ML
ollama/ollama | Go | AI/ML
ggml-org/llama.cpp | C++ | AI/ML
comfyanonymous/ComfyUI | Python | AI/ML
pytorch/pytorch | Python | AI/ML
facebook/react | JavaScript | 前端
vercel/next.js | JavaScript | 前端
tailwindlabs/tailwindcss | TypeScript | 前端
sveltejs/svelte | JavaScript | 前端
shadcn-ui/ui | TypeScript | 前端
golang/go | Go | 后端
rust-lang/rust | Rust | 后端
denoland/deno | Rust | 后端
torvalds/linux | C | 后端
kubernetes/kubernetes | Go | DevOps
docker/compose | Go | DevOps
grafana/grafana | TypeScript | DevOps
ansible/ansible | Python | DevOps
microsoft/vscode | TypeScript | 工具
vitejs/vite | TypeScript | 工具
jesseduffield/lazygit | Go | 工具
ohmyzsh/ohmyzsh | Shell | 工具
electron/electron | C++ | 工具
localsend/localsend | Dart | 工具
kamranahmedse/developer-roadmap | TypeScript | 学习资源
freeCodeCamp/freeCodeCamp | TypeScript | 学习资源
sindresorhus/awesome | null | 学习资源
ossu/computer-science | null | 学习资源
home-assistant/core | Python | 其他
ethereum/go-ethereum | Go | 其他

【输出】
只输出 mock-data.json 一个文件的完整内容。JSON 必须能被 JSON.parse 解析，不要有尾逗号。
输出前自己检查一遍：31 条、7 个分类全覆盖、language 去重后 ≥8 种、近 7 天 ≥12 条。
```

---

## 8. P0.6 七个主进程 stub + config

**产出**：`src/main/github.ts`、`local.ts`、`ai.ts`、`store.ts`、`report.ts`、`recommend.ts`、`tracker.ts`

**完成后必做**：
```bash
npm run typecheck && npm run lint
git add -A && git commit -m "feat(main): 各业务模块 stub 与可用版 store"
```

> 这一步是 Wave 0 的灵魂：**签名是真的，函数体是假的**。这样 6 个人可以同时开工，编译零阻塞。

```text
请按 docs/module-signatures.md 的签名，生成 7 个主进程模块文件。

【统一模式（除 store.ts 外全部照此写）】
每个导出函数体只有两行：
  if (isMockMode()) return mockXxx(...)      // 走 Mock
  throw new Error('NOT_IMPLEMENTED: <模块>.<函数>')   // 真实实现留给负责人
从 './config' 引入 isMockMode，从 './mock' 引入需要的 mock 函数。

下面逐个文件说明。

【1】src/main/github.ts
- fetchStarred / fetchReadme / fetchReleases / fetchCommits / unstar / fork
- mock 分支分别调 mockStarred / mockReadme / mockReleases / mockCommits / mockUnstar / mockFork
- unstar 在 mock 下返回 void（mockUnstar 无返回）
- 真实分支一律 throw new Error('NOT_IMPLEMENTED: github.xxx')
- 文件顶部写一行注释：// 负责人：P1 ｜ 规格见 guide.md 第 10 节

【2】src/main/local.ts
- chooseDir / clone / openDir
- mock 分支：
  * chooseDir() → 用 app.getPath('downloads') 拼一个 StarPilotDemo 目录，用 fs.mkdirSync(..., {recursive:true}) 确保存在，返回该路径
  * clone(fullName, targetDir) → 在 targetDir 下建 mkdirSync(join(targetDir, repoName), {recursive:true})，在里面写一个 README.md（内容 "# <fullName> 的本地副本"），返回该路径
  * openDir(path) → **不走 mock，直接走真实实现**：用 shell.openPath，若 path 不存在先 fs.existsSync 判断并 throw new Error('路径不存在: ' + path)
- 真实分支：clone / chooseDir 一律 throw new Error('NOT_IMPLEMENTED: local.xxx')
- 注意：chooseDir 真实实现将来要用 dialog.showOpenDialog，本轮不写

【3】src/main/ai.ts
- summarize / classify / enrichRepos / generateReport
- mock 分支：mockSummary(readme) / mockClassify(repo) / mockEnrich(repos) / mockReportSummary(repos)
- classify 的返回值必须收敛到 AI_CATEGORIES：真实实现里也要校验，不在集合内就返回 '其他'
- 真实分支 throw new Error('NOT_IMPLEMENTED: ai.xxx')

【4】src/main/report.ts
- generate(): Promise<WeeklyReport> —— 这个函数**要多写一点，不要只 throw**：
  * 读 store.getRepos()
  * 计算 weekStart / weekEnd（本周一 00:00 到周日 23:59:59，ISO 8601）
  * newStars = starred_at 落在本周区间内的仓库，按 starred_at 倒序
  * languageStats = 全部仓库按 language 聚合计数（language 为 null 的记为 '未知'）
  * dailyStarCount = 最近 7 天，key 为 'YYYY-MM-DD'，value 为当天新增数（没有的日期要补 0，
    保证 chart 有 7 个连续点，这是给 ECharts 用的，缺日期图会断）
  * topRepos = 按 stargazers_count 倒序取前 5
  * aiSummary = await ai.generateReport(newStars.map(r => r))
  * 导入用 import * as ai from './ai' 和 import * as store from './store'
- 这是骨架里唯一"提前实现"的业务逻辑，因为周报页需要有东西可渲染

【5】src/main/recommend.ts —— similar(fullName)：mock 走 mockSimilar，真实 throw
【6】src/main/tracker.ts —— start() / stop()：mock 下用 node-cron 真的起一个任务但
   任务体里只 console.log('[tracker] mock tick')；
   真实实现 throw。注意用模块级变量保存任务句柄，stop() 时销毁，重复 start 要幂等
   （已启动就直接 return，不要起两个任务）

【7】src/main/store.ts —— 这个文件**要实现成可用的**，不是 stub：
- 用 lowdb@7：import { JSONFilePreset } from 'lowdb/node'
- db 文件：isMockMode() 为 true 时用 path.join(app.getPath('userData'), 'starpilot.mock.db.json')，
  否则用 'starpilot.db.json'
- 数据结构：{ repos: Repo[], token: string | null }
- 用模块级变量缓存 db 实例，不要每次调用都重新读文件
- getToken(): 返回解密后的 token 或 null
- saveToken(token): 用 safeStorage.isEncryptionAvailable() 判断，
  可用则 safeStorage.encryptString(token) 后存 base64 字符串，不可用则**存明文并在控制台警告**
  （Linux 无 keyring 时会走到这条，不要让它崩）
- hasToken(): 返回 token 是否存在且非空
- getRepos(): 读 db.repos；如果为空数组且 isMockMode()，用 mockStarred() 做种子写入后返回
- saveRepos(repos): 整体覆盖写入并 await db.write()
- updateLocalState(fullName, state): 找到该仓库，用 { ...repo.local, ...state } 合并后写回
- 所有函数都要有 try/catch，出错时 console.error 并抛出可读的错误信息
- 文件顶部注释：// 负责人：P3 ｜ 骨架版已可用，P3 负责加固（原子写、缓存、错误分支）

【绝不修改】shared/types.ts、shared/ipc.ts、docs/*。如需新字段，最后单列「需要集成工程师确认：xxx」。
```

---

## 9. P0.7 main/index.ts —— 22 个 handler 全注册

**产出**：`src/main/index.ts`（整体替换 P0.1 的临时版）

**完成后必做**：
```bash
npm run typecheck && npm run lint && npm run build
# 检查 27 个通道是否都注册了
grep -c "ipcMain.handle" src/main/index.ts    # 必须是 27
ls out/preload/                                # 确认产物文件名是 index.mjs
```
```bash
git add -A && git commit -m "feat(main): 注册全部 IPC handler 与窗口生命周期"
```

```text
请完整实现 src/main/index.ts。这是集成工程师独占维护的文件，本轮写完后 Wave 1 期间不再改动。

【结构要求】
1. 第一行 import 'dotenv/config'
2. ESM 下用 import { fileURLToPath } from 'node:url' 和 dirname 推导 __dirname
3. 导入所有业务模块：import * as github from './github'，local / ai / store / report / recommend / tracker 同理
4. 从 '@shared/ipc' 引入 IPC，从 '@shared/types' 引入 IpcResult 等类型

【统一 handler 包装器（关键，不要让每个 handler 重复 try/catch）】
写一个辅助函数：
  function handle<T>(channel: string, fn: (...args: any[]) => Promise<T> | T): void {
    ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
      try {
        const data = await fn(...args)
        return { ok: true, data }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[ipc] ${channel} 失败:`, message)
        return { ok: false, error: message }
      }
    })
  }
注意：ipcMain.handle 的回调第一个参数是 event，必须丢弃掉再传业务参数，
否则业务函数会收到多余的 event 参数。

【必须注册的 27 个通道（一个都不能少，也不能多）】
handle(IPC.GITHUB_FETCH_STARRED, () => github.fetchStarred())
handle(IPC.GITHUB_FETCH_README, (fullName: string) => github.fetchReadme(fullName))
handle(IPC.GITHUB_FETCH_RELEASES, (fullName: string) => github.fetchReleases(fullName))
handle(IPC.GITHUB_FETCH_COMMITS, (fullName: string) => github.fetchCommits(fullName))
handle(IPC.GITHUB_UNSTAR, (fullName: string) => github.unstar(fullName))
handle(IPC.GITHUB_FORK, (fullName: string) => github.fork(fullName))
handle(IPC.LOCAL_CHOOSE_DIR, () => local.chooseDir())
handle(IPC.LOCAL_CLONE, (fullName: string, targetDir: string) => local.clone(fullName, targetDir))
handle(IPC.LOCAL_OPEN_DIR, (path: string) => local.openDir(path))
handle(IPC.AI_SUMMARIZE, (readme: string) => ai.summarize(readme))
handle(IPC.AI_CLASSIFY, (repo: Repo) => ai.classify(repo))
handle(IPC.AI_ENRICH_REPOS, (repos: Repo[]) => ai.enrichRepos(repos))
handle(IPC.AI_GENERATE_REPORT, (repos: Repo[]) => ai.generateReport(repos))
handle(IPC.STORE_GET_REPOS, () => store.getRepos())
handle(IPC.STORE_SAVE_REPOS, (repos: Repo[]) => store.saveRepos(repos))
handle(IPC.STORE_SAVE_TOKEN, (token: string) => store.saveToken(token))
handle(IPC.STORE_HAS_TOKEN, () => store.hasToken())
handle(IPC.STORE_UPDATE_LOCAL_STATE, (fullName: string, state: Partial<LocalState>) => store.updateLocalState(fullName, state))
handle(IPC.STORE_CLEAR_TOKEN, () => store.clearToken())
handle(IPC.REPORT_GENERATE, () => report.generate())
handle(IPC.RECOMMEND_SIMILAR, (fullName: string) => recommend.similar(fullName))
handle(IPC.TRACKER_START, () => tracker.start())
handle(IPC.TRACKER_STOP, () => tracker.stop())
handle(IPC.AUTH_GET_STATE, () => auth.getState())
handle(IPC.AUTH_START_DEVICE_FLOW, () => auth.startDeviceFlow())
handle(IPC.AUTH_WAIT_FOR_LOGIN, () => auth.waitForLogin())
handle(IPC.AUTH_CANCEL_DEVICE_FLOW, () => auth.cancelDeviceFlow())

【unstar 的额外约定（破坏性操作，写死在这里）】
IPC.GITHUB_UNSTAR 的 handler 不能只调 github.unstar，必须：
  1) await github.unstar(fullName)
  2) 从 store.getRepos() 取列表，过滤掉该仓库
  3) await store.saveRepos(过滤后的列表)
这样"unstar 成功后从本地列表移除"这条规则由主进程保证，前端不需要自己删除。
（前端仍然负责二次确认弹窗，那是 UI 职责）

【窗口与生命周期】
- createWindow()：1280x860，webPreferences { preload: join(__dirname, '../preload/index.mjs'),
  contextIsolation: true, nodeIntegration: false, sandbox: false }
- dev 用 process.env['ELECTRON_RENDERER_URL']，生产 loadFile(join(__dirname, '../renderer/index.html'))
- app.whenReady() 里先 ipcMain 全部注册，再 createWindow()
- window-all-closed：非 darwin 就 quit；activate：无窗口则重建
- **不要自动启动 tracker**（TRACKER_START 由前端显式调用）
- 启动时打印一行日志：[main] MOCK_MODE = <true|false>，方便现场排查

【严禁】
- 不要用 ipcMain.on / send，全部用 handle / invoke
- 不要用 remote 模块
- 不要把 token 从渲染进程传进来（token 只由 store 管理）
- 不要改 shared/ 下任何文件
```

---

## 10. P0.8 渲染进程骨架

**产出**：`src/renderer/src/` 下：`main.tsx`、`App.tsx`、`index.css`、`store/repoStore.ts`、`lib/api.ts`、`components/common/ConfirmDialog.tsx`、`components/common/Toast.tsx`、`components/common/Button.tsx`、`components/common/Card.tsx`、`components/layout/AppShell.tsx`、`pages/Dashboard.tsx`、`pages/Report.tsx`、`pages/Settings.tsx`

**完成后必做**：
```bash
npm run typecheck && npm run lint
MOCK_MODE=true npm run dev
# 手工验证：能看到 31 张卡片、能筛选、点 unstar 有二次确认弹窗并消失、能切到周报页
```
```bash
git add -A && git commit -m "feat(renderer): 界面骨架与仓库状态管理"
```

> ⚠️ `Dashboard.tsx` 和 `Report.tsx` 本轮只做**能证明链路通**的极简版，Wave 1 里 P5 / P6 会整体重写。其余文件（store / lib / common / layout）是给 P5 消费的，要写扎实。

```text
请实现渲染进程骨架。目标：MOCK_MODE=true 启动后能看到仓库卡片列表、能筛选、能 unstar（带二次确认）、
能切到周报页并生成周报。不要引入 react-router（用 useState 切 tab 即可）。

【关键：以下 4 个签名已被冻结在 docs/renderer-contracts.md，必须逐字一致】

A. src/renderer/src/store/repoStore.ts（Zustand）
export interface RepoFilters { keyword: string; language: string | null; category: AiCategory | null; onlyCloned: boolean }
export interface RepoStore {
  repos: Repo[]
  loading: boolean
  filters: RepoFilters
  visibleRepos(): Repo[]
  setFilters(patch: Partial<RepoFilters>): void
  load(): Promise<void>
  refreshFromGitHub(): Promise<void>
  enrich(): Promise<void>
  unstar(fullName: string): Promise<void>
  fork(fullName: string): Promise<void>
  clone(fullName: string): Promise<void>
  openDir(path: string): Promise<void>
}
export const useRepoStore = create<RepoStore>(...)
实现要点：
- load() 调 window.api.store.getRepos()，用 unwrap 拆包
- refreshFromGitHub() 调 window.api.github.fetchStarred() 然后 store.saveRepos()
- enrich() 调 window.api.ai.enrichRepos(repos) 并更新本地列表
- unstar/fork 调对应 api；unstar 后重新 load()（主进程已经改了 store）；
  fork 后把返回的 Repo 在本地列表里替换掉，并调 store.updateLocalState
- clone() 先 chooseDir()，用户取消（返回 null）就直接 return，不要报错
- visibleRepos() 是纯函数式筛选：keyword 匹配 full_name 或 description（不区分大小写）、
  language 精确匹配、category 精确匹配、onlyCloned 只看 local.cloned_path 存在的
- 用 zustand 的普通 create，不要引入 immer

B. src/renderer/src/lib/api.ts
export async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T>
- ok 为 true 返回 data；否则用 useToast().push({ type:'error', message: error }) 提示后 throw new Error(error)
- 注意：Toast 的 push 要能在非组件环境调用，所以 useToast 的 store 要放在模块级（不要依赖 React context 才能取到）

C. src/renderer/src/components/common/ConfirmDialog.tsx
export interface ConfirmDialogProps { open: boolean; title: string; description?: string; confirmText?: string; danger?: boolean; onConfirm(): void; onCancel(): void }
- 用固定定位 + 半透明遮罩 + Tailwind 实现，danger 为 true 时确认按钮是红色
- 按 Esc 关闭，点遮罩关闭

D. src/renderer/src/components/common/Toast.tsx
export interface ToastItem { id: string; type: 'success' | 'error'; message: string }
export function ToastProvider({ children }): JSX.Element
export function useToast(): { push(t: { type: 'success' | 'error'; message: string }): void }
- 用一个模块级的 zustand store 保存 toast 列表，ToastProvider 只负责渲染
- push 后 3 秒自动移除，右上角堆叠，success 绿色 error 红色

【其余文件】
- components/common/Button.tsx、Card.tsx：手写的极简 Tailwind 组件
  （**不要运行 npx shadcn init**，不要装 radix，不要新增任何依赖）
- components/layout/AppShell.tsx：左侧或顶部导航，两个 tab「Star 管理」「周报」，外加上「设置」；
  包含 <ToastProvider>；导航项用 props 传入当前页和切换函数
- pages/Settings.tsx：一个输入框填 GitHub Token，调 window.api.store.saveToken；
  一个按钮调 window.api.store.hasToken 显示状态；一个「从 GitHub 同步」按钮调 refreshFromGitHub；
  一个「AI 补全分类」按钮调 enrich()
- pages/Dashboard.tsx（极简占位，P5 会重写）：
  * 顶部：搜索框、语言下拉（从 repos 里动态去重）、分类下拉（用 AI_CATEGORIES）
  * 列表：每张卡片显示 full_name、description、language、stargazers_count、ai_category
  * 每张卡片三个按钮：Unstar（弹 ConfirmDialog 二次确认，danger 样式）、Fork、Clone
  * unstar 成功后 Toast 提示「已取消 Star」；clone 成功后 Toast 提示路径
  * **本轮不要画 ECharts 图表**（依赖已装好，图表是 P5 的活）
  * 空列表时显示「还没有数据，去设置页同步」
- pages/Report.tsx（极简占位，P6 会重写）：
  * 一个「生成本周周报」按钮，调 window.api.report.generate()
  * 把 WeeklyReport 用 JSON.stringify(report, null, 2) 展示在 <pre> 里即可
  * 本周新增数量、语言分布 key 数量用大字展示
- App.tsx：useState 管理当前 tab，渲染 AppShell
- main.tsx：createRoot 渲染 <App />，import './index.css'

【严禁】
- 不要 import 任何 src/main/** 或 @shared/../main/*
- 不要使用 process / require / fs / path
- 不要用 any 绕过类型（window.api 的类型由 src/preload/index.d.ts 提供，
  如果 typecheck 报 window.api 不存在，请检查 src/preload/index.d.ts 里的 declare global 是否生效，
  而不是在 renderer 里自己再声明一遍）
- 不要新增任何 npm 依赖
```

---

## 11. P0.9 协作基建

**产出**：`.github/workflows/ci.yml`、`.github/CODEOWNERS`、`.github/pull_request_template.md`、`README.md`

**完成后必做**：把仓库推到 GitHub，在 Settings → Branches 给 `main` 打开：
✅ Require a pull request before merging（**不要勾 Require approvals**）→ ✅ Require status checks to pass → 选 `ci / check`
```bash
git add -A && git commit -m "chore(ci): CI、CODEOWNERS 与 PR 模板"
git push origin main
```

```text
请生成协作基建文件。

【1】.github/workflows/ci.yml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
  protect-contracts:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: 检查契约与基建文件是否被非集成工程师修改
        run: |
          # 集成工程师的 GitHub 账号列表（多个用 | 分隔）
          # Yuminghuang738 = P7（集成工程师），同时也是仓库所有者。
          INTEGRATORS="Yuminghuang738"
          if echo "$INTEGRATORS" | grep -qw "${{ github.actor }}"; then
            echo "集成工程师提交，跳过检查"
            exit 0
          fi
          CHANGED=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)
          echo "变更文件："; echo "$CHANGED"
          if echo "$CHANGED" | grep -E '^(src/shared/|src/preload/|src/main/index\.ts$|src/main/config\.ts$|src/main/mock\.ts$|mock-data\.json$|package(-lock)?\.json$|tsconfig\.json$|electron\.vite\.config\.ts$|electron-builder\.yml$|eslint\.config\.js$|tailwind\.config\.js$|postcss\.config\.js$|\.github/|docs/|README\.md$|\.env\.example$)'; then
            echo "❌ 契约/基建文件被修改，必须由集成工程师提交（见 prompts/p7-integration.md 的 Part D 协作规则）"
            exit 1
          fi
          echo "✅ 只改了业务文件"
  frontend-isolation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: 禁止渲染进程 import 主进程
        run: |
          if grep -rnE "from '.*(main/|@shared/\.\./main)" src/renderer/src 2>/dev/null; then
            echo "❌ 渲染进程不允许 import 主进程代码"
            exit 1
          fi
          echo "✅ 渲染进程隔离正常"

如果 grep 没匹配到任何文件，脚本不能因为 grep 返回 1 而失败（用 if 包住）。

【2】.github/CODEOWNERS（只做 @提醒，不强制审批）—— 已填真实账号，内容如下
⚠️ 注意 CODEOWNERS 的匹配规则是「**最后一个**匹配的规则生效」，所以顺序不能随意调。
/src/shared/            @Yuminghuang738
/src/preload/           @Yuminghuang738
/src/main/index.ts      @Yuminghuang738
/src/main/config.ts     @Yuminghuang738
/src/main/mock.ts       @Yuminghuang738
/src/renderer/index.html        @Yuminghuang738
/src/renderer/src/main.tsx      @Yuminghuang738
/src/renderer/src/index.css     @Yuminghuang738
/src/renderer/src/env.d.ts      @Yuminghuang738
/src/main/github.ts     @xiaoyu8745
/src/main/local.ts      @Chang-66
/src/main/store.ts      @Chang-66
/src/main/ai.ts         @xiaoran77-web
/src/main/report.ts     @nothing6741
/src/main/recommend.ts  @nothing6741
/src/main/tracker.ts    @nothing6741
/src/renderer/src/pages/Dashboard.tsx  @syeu-oss
/src/renderer/src/components/repo/     @syeu-oss
/src/renderer/src/components/charts/   @syeu-oss
/src/renderer/src/pages/Report.tsx     @zoushiying
/src/renderer/src/pages/Settings.tsx   @zoushiying
/src/renderer/src/App.tsx              @zoushiying
/src/renderer/src/store/               @zoushiying
/src/renderer/src/lib/                 @zoushiying
/src/renderer/src/components/common/   @zoushiying
/src/renderer/src/components/layout/   @zoushiying
说明：原模板漏了 `pages/Settings.tsx`（P6 的地盘）和渲染进程脚手架四个文件
（`index.html` / `main.tsx` / `index.css` / `env.d.ts`，属于 P7，不在 P6 的可改清单里），
已补齐。`components/repo/` 与 `charts/` 目前还不存在（P5 会新建），
先占位，目录一出现就自动生效——这是有意为之，不是错误。

【3】.github/pull_request_template.md
## 改了什么
- 核心文件与功能点

## 怎么测试
- 本地步骤 / 是否依赖 Mock

## 是否改了 shared
- [ ] 否
- [ ] 是（已 @集成工程师 确认）

## CI
- [ ] typecheck / lint / build 全绿

【4】README.md（中文）
必须包含：
- 一句话项目介绍 + Slogan
- 环境要求：Node 20.19+ 或 22.12+（Vite 7 要求）、npm 10+、**系统已安装 git 且 git 在 PATH 中**（simple-git 依赖它）
- 快速开始：npm install → cp .env.example .env → 填变量 → npm run dev
- 环境变量表格（5 个变量及说明，特别说明 MOCK_MODE=true 时不需要任何真实 Key）
- **GitHub PAT 所需 scope**：public_repo（unstar / fork 必需）、read:user；并加醒目警告：
  unstar 是破坏性操作，fork 是写操作，演示时务必说明
- 目录结构说明（一句话一个目录）
- 可用脚本表格（dev / build / typecheck / lint / build:win / build:linux）
- **给 AI 生成代码的提示**：任何生成代码前先读 src/shared/types.ts 和 src/shared/ipc.ts，
  不得修改这两个文件
- 团队协作：分支命名 `类型/模块名-名字`、Conventional Commits、不要求人工 Approve、
  禁止直接 push main、禁止 force push
```

---

## 12. P0.10 骨架自检（把这段发给 AI 让它复查）

**完成后必做**：
```bash
npm run typecheck && npm run lint && npm run build
grep -c "ipcMain.handle" src/main/index.ts
ls out/preload/
npx install-electron --no   # 干净克隆后第一次必跑（见坑 #22），否则下一步必失败
MOCK_MODE=true npm run dev
```
然后按第 13 节逐条手工过一遍。

```text
请检查你刚才为 StarPilot 生成的全部骨架代码，逐条回答"是/否"并给出文件与行号：

1. src/shared/types.ts 和 src/shared/ipc.ts 是否与需求文档逐字一致？有没有被改动、增删字段？
2. src/main/index.ts 是否注册了全部 27 个 IPC 通道？有没有漏掉 AI_ENRICH_REPOS 或多注册？
3. ipcMain.handle 的包装器是否正确丢弃了第一个 event 参数，没有把它传给业务函数？
4. 所有 handler 是否都返回 IpcResult 结构（{ ok: true, data } / { ok: false, error }）？
5. GITHUB_UNSTAR 的 handler 是否在调用 github.unstar 之后，还从 store 删除了该仓库并写回？
6. src/main/mock.ts 是否是唯一的假数据来源？有没有任何其他文件直接 import mock-data.json？
7. src/main/mock.ts 里的 ai_category 是否稳定可复现（没有用 Math.random）？
8. src/main/store.ts 的 MOCK_MODE 是否使用了不同的 db 文件名？safeStorage 不可用时是否会崩？
9. src/main/local.ts 的 openDir 在 MOCK_MODE 下是否仍然走真实实现？
10. src/main/report.ts 的 dailyStarCount 是否补齐了 7 个连续日期（缺的补 0）？
11. 渲染进程是否有任何一处 import 了 src/main/** 或使用了 process / require / fs？
12. 渲染进程的冻结签名（repoStore / unwrap / ConfirmDialogProps / useToast）是否与
    docs/renderer-contracts.md 逐字一致？**另外**：`components/common/Toast.tsx` 是否仍然
    导出 `pushToast`？（它**不在**契约文件里，但 lib/api.ts 和 store/repoStore.ts 都在用，
    删了会连锁编译失败——见坑 #19）
13. 是否使用了 require、remote 模块、nodeIntegration: true？
14. 是否安装了版本锁定表以外的新依赖？
15. package.json 里 p-limit 是否是 3.x、tailwindcss 是否是 3.4.x、typescript 是否是 5.9.x、
    vite 是否是 7.x、@vitejs/plugin-react 是否是 5.x？
16. 是否有任何文件用省略号或"其余代码不变"占位？
17. 是否引入了 react-router 或 radix-ui 等未在锁定表内的包？

如果有任何一条是"否"或"不确定"，请完整重写相关文件，不要只给 diff。
```

---

## 13. 骨架完成验收清单（人执行，AI 不参与）

全部通过才能宣布 T+0 完成、通知 6 个人开工。

**命令行**
- [ ] `npm ci` 成功（说明 package-lock.json 已提交）
      ⚠️ `npm ci` **不会**装 Electron 二进制（见坑 #22），它成功不代表能 `npm run dev`；
      跑 dev 之前先 `npx install-electron --no`
- [ ] `npm run typecheck` → 0 error
- [ ] `npm run lint` → 0 error
- [ ] `npm run build` → 产出 `out/main/index.js`、`out/preload/index.mjs`、`out/renderer/index.html`
- [ ] `grep -c "ipcMain.handle" src/main/index.ts` → **27**
- [ ] `ls out/preload/` → 文件名确实是 `index.mjs`（不是 `.js`，否则主进程 preload 路径会 404）

**功能（`MOCK_MODE=true npm run dev`）**
- [ ] 窗口正常打开，控制台打印 `[main] MOCK_MODE = true`
- [ ] 首次启动列表自动出现 **31 条**仓库卡片（mock-data.json 全量，store 的种子逻辑生效）
      ⚠️ 原文写"≥24"，是低估了；以 `src/main/mock-data.json` 的实际条数为准
- [ ] 语言下拉有 **≥8 个**选项
- [ ] 分类下拉选中任意一项都有结果（**7 个分类都要逐个点一遍**，任何一个为空说明 mockClassify 映射漏了）
- [ ] 搜索框输入 `react` 能筛出结果
- [ ] 点 Unstar → 弹二次确认 → 确认后卡片消失 → Toast 提示
- [ ] **关掉应用重新 `npm run dev`，刚才 unstar 的卡片没有复活**（内存态 + 落盘都对了）
- [ ] 点 Fork → 按钮变成「已 Fork」或卡片显示 forked 信息
- [ ] 点 Clone → 选目录（mock 下返回下载目录）→ Toast 显示路径 → 按钮变成「打开目录」
- [ ] 点「打开目录」→ 系统文件管理器真的打开了那个文件夹
- [ ] 切到周报页 → 点「生成本周周报」→ 有 JSON 输出、本周新增数量 **> 0**（说明近 7 天数据够）
- [ ] 切到设置页 → 保存一个假 token → 状态显示「已保存」

**仓库**
- [ ] `main` 分支保护已开（Require PR + Require status checks = `ci / check`，未勾 Require approvals）
- [x] ✅ `.github/workflows/ci.yml` 的 `INTEGRATORS` 已填 `Yuminghuang738`
      （**必须最先做**：留占位会让所有 PR 都走"非集成工程师"分支，
      连引入契约的骨架 PR 自己都会被 `protect-contracts` 拦下。
      `Yuminghuang738` = P7 集成工程师，同时也是仓库所有者，所以单账号即可）
- [x] ✅ `.github/CODEOWNERS` 的 `@P1账号` ~ `@P7账号` 占位已全部替换成真实账号，
      并补上了原先漏掉的 `pages/Settings.tsx` 与渲染进程脚手架四个文件。
      ⚠️ 原先我在这一条里写"引用了不存在的 `components/repo/`、`charts/` 目录"是**我判断错了**：
      那是**有意占位**，CODEOWNERS 允许写还不存在的路径，目录一建出来就自动生效，不是缺陷
- [ ] 7 个 issue 已创建（见本文件 Part B），每个 issue 里贴好了该模块的提示词包（P1~P6 的工作包已拆成 `prompts/p1-github.md` ~ `prompts/p6-renderer-core.md`，直接作为 issue 正文附件发给本人）

---

## 14. 已知坑（真实查证，不要从提示词里删）

| # | 坑 | 后果 | 对策 |
|---|---|---|---|
| 1 | `electron-vite@5` 的 peer 是 `vite ^5‖^6‖^7`，**不含 8** | 装 vite 8 直接 peer 冲突 / 运行时炸 | 锁 vite `^7.3.6` |
| 2 | `@vitejs/plugin-react@6.x` 的 peer 是 `vite ^8` | 与 vite 7 不兼容 | 锁 `^5.2.0` |
| 3 | `typescript-eslint@8` 的 peer 是 `typescript >=4.8.4 <6.0.0` | 装 TS 7 会 lint 直接罢工 | 锁 typescript `^5.9.3` |
| 4 | Tailwind v4 改成了 CSS-first 配置，且 shadcn 生态教程几乎全是 v3 | AI 会写出 v3/v4 混合的配置，样式全丢 | 锁 `tailwindcss@^3.4.19`，并在提示词里明说不要 v4 |
| 5 | p-limit v4+ 是纯 ESM | 即使主进程是 ESM 也可能与打包器摩擦 | 按 guide 铁律锁 `3.1.0` |
| 6 | preload 产物文件名取决 electron-vite 版本（`.js` / `.mjs`） | 主进程 preload 路径写错 → `window.api` 是 undefined，前端全废 | 在 `electron.vite.config.ts` 里强制 `entryFileNames: 'index.mjs'`，并在验收清单里 `ls out/preload/` 确认 |
| 7 | ESM 主进程 + `sandbox: true` 会导致 preload 无法加载 | 同上，`window.api` undefined | 明确 `sandbox: false`，同时保留 `contextIsolation: true` |
| 8 | `dotenv/config` 必须是 main 的第一行 import | 环境变量读不到，MOCK_MODE 恒为 false，演示时真调 GitHub 直接 401 | 写进提示词并列入自检 |
| 9 | `npx shadcn init` 是交互式的，还会重写 tailwind.config | CI 卡住 + 样式配置被覆盖 | 明令禁止跑任何交互式初始化，手写 4 个基础组件 |
| 10 | mock 数据 `starred_at` 如果都堆在一个月前 | 周报「本周新增」= 0、趋势图全 0，演示最丢脸的时刻 | mock-data.json 硬性要求近 7 天 ≥12 条，验收清单手工确认 |
| 11 | `ipcMain.handle` 回调第一个参数是 event | 业务函数收到多余参数，`unstar(event)` 之类静默出错 | 统一包装器里丢弃 event，列入自检第 3 条 |
| 12 | Electron 44 内置 Node 22，但 `@types/node` 装成 26 | 类型与运行时不符，出现"Node 有但 Electron 没有"的 API | 锁 `@types/node@^22.20.4` |
| 13 | MOCK_MODE 与真实模式共用同一个 db 文件 | 演示用的假数据污染真实数据，或反之 | store.ts 按 MOCK_MODE 分成两个文件名 |
| 14 | CI 里 `grep` 没匹配到会返回 1 | `protect-contracts` job 无故失败 | 用 `if grep ...; then` 包住，不要裸跑 |
| 15 | React 19 移除了全局 `JSX` 命名空间 | 写 `: JSX.Element` 会报 "Cannot find namespace 'JSX'"，AI 极爱这么写 | 一律写 `React.JSX.Element`，或干脆不写返回类型让 TS 推断。⚠️ **契约里其实还没改**：`docs/renderer-contracts.md:45,49` 至今仍写着 `JSX.Element`（见下面第 15 节待办第 1 条）。好消息是 P6 提示词没让他照抄返回类型，所以骨架能编译过；坏消息是"契约即事实"的假设在这里不成立 |
| 16 | `shell.openPath()` 永远 resolve，不 reject | 用 try/catch 抓不到失败，打开目录静默无效 | 必须检查返回的字符串，非空即为错误（已写进 P3 提示词） |
| 17 | `Accept: application/vnd.github.star+json` 返回的是 `{ starred_at, repo }` 而不是仓库对象 | `item.full_name` 全是 undefined，首页直接空列表 | P1 提示词里要求写防御式兼容 `raw.repo ?? raw`（已写进 P1 提示词） |
| 18 | ~~渲染进程用 `toISOString().slice(0,10)` 算日期 → 要求改用本地时间~~ **（本条原文写反了，已更正）** | 原文的"对策"才是 bug：本项目 `starred_at` 存的是 GitHub 给的 **UTC** ISO 8601，主进程 `report.ts` 的 `dateKey` / `startOfWeek` / `dailyStarCount` 全程按 UTC 生成。如果渲染层或周报层改用**本地时间**分桶，就成了"用本地时间的边界去切 UTC 时间戳"，东八区深夜会把当天的 Star 归到前一天，**图上 7 个点和 AI 总结里的新增数对不上** | **全项目统一 UTC**：日期 key 一律 `d.toISOString().slice(0, 10)`，周区间用 `Date.UTC` / `getUTCDay` / `setUTCDate`。⚠️ 这条错误对策曾被抄进 P4/P5/P6 三份提示词（P4 的 A1/A4、P5 的 StarTrendChart、P6 的 `toLocalDateKey`），**现已逐条更正并在那三份里留了"原文写反了"的批注**；`renderer-contracts` 里也**没有**任何本地时间格式化函数，别再造 |
| 19 | `docs/renderer-contracts.md` 的 Toast 一节**漏了 `pushToast`** | 骨架的 `lib/api.ts:2` 和 `store/repoStore.ts:4` **都**在 `import { pushToast }`。契约只列了 `ToastItem` / `ToastProvider` / `useToast`，而 P6 的提示词让他"按契约重写 Toast.tsx"——他要是照着只留那三个导出，`api.ts` 和 `repoStore.ts` 立刻编译失败，且从契约上看不出有谁在用 | 给 P6 的提示词里已明说"你要遵守的是**两份清单的并集**，`pushToast` 必须保留"。根治办法是把 `pushToast` 补进契约（见第 15 节待办第 2 条） |
| 20 | zustand v5 用**严格相等**比较 `useSyncExternalStore` 的快照 | 组件里写 `useRepoStore((s) => s.visibleRepos())`（或 `visibleRepos()` 恒返回新数组）会每次判定"值变了"→ **无限重渲染**，界面直接卡死，控制台刷 `getSnapshot should be cached` / `Maximum update depth exceeded` | 骨架已把筛选逻辑抽成纯函数 `filterRepos(repos, filters)` 并在 `repoStore.ts:35-57` 写了注释说明原因；组件侧必须 `useMemo(() => filterRepos(repos, filters), [repos, filters])`。P5 提示词里已加醒目警告 |
| 21 | `npm run format` 的 glob 覆盖**冻结契约** | `package.json` 里它的 glob 是 `src/**/*.{ts,tsx,css,json}`，会扫到 `src/shared/types.ts` / `ipc.ts`；而 `.prettierrc` 是 `semi: false`、契约带分号，跑一次就把契约整体重排 → diff 一片红 → `protect-contracts` 直接把 PR 拦下 | 明令禁止跑 `npm run format`（已写进 README、六份提示词的协作规则表）。要格式化自己的文件就指定路径 |
| 22 | `electron@44.5.1` 的 package.json **没有 `scripts` 字段** → 没有 postinstall | `npm install` / `npm ci` **都不会**下载 Electron 二进制，干净克隆后直接 `npm run dev` 必然报 `Electron failed to install correctly`（不是网络问题） | 干净克隆后先跑 `npx install-electron --no`。已写进六份提示词的前置条件和协作规则表 |
| 23 | 提示词说"某组件要新建"，但它其实**已经存在** | 按提示词重写会覆盖掉在用的实现。已查证的：`components/common/Button.tsx`、`Card.tsx` 骨架里就有，且被 Dashboard / Report / Settings / ConfirmDialog 十几处在用；`AppShell.tsx` 内部**已经**包了 `<ToastProvider>` | `Button.tsx` 现有 `variant` 含 **`secondary`（且是默认值）**、props `extends ButtonHTMLAttributes`（有 `...rest` 透传）——原文的 props 清单把这两条都漏了，照抄会让 Dashboard 的 Fork 按钮变无色、并丢掉 `onClick`/`disabled`/`className`。P6 提示词里已改成"加固，不是新建"并逐条点名 |
| 24 | 骨架主色是 **sky**，但提示词写的是 **indigo** | P5 和 P6 若各按自己那份改成 indigo，页面里会同时出现两种主色；更糟的是 `Button.tsx` / `AppShell.tsx` 都属于 P6 的地盘，**P5 看见了也改不了** | 统一到骨架的 `sky-600`（选中态）/ `sky-500`（hover）。P5、P6 两份提示词的配色段已更正 |


---

## 15. 开工前必须拍板的未决事项（P7 自己决定，别拖到 Wave 1）

这四条是审计骨架时查实的真实分歧，**都不是任何单个模块能自己决定的**。Wave 1 开始前定掉，
否则等 6 个人都开工了再改契约，等于让 6 个 PR 同时返工。

**① `docs/renderer-contracts.md:45,49` 还是 `JSX.Element`**
React 19 已移除全局 `JSX` 命名空间（坑 #15）。p7 第 4 节要求"原样落地"的契约文本里写的是
`React.JSX.Element`，但仓库里实际落地的是 `JSX.Element`——两边不一致，说明当时没改。
现状能编译过，只是因为 P6 没照抄这两行返回类型。
→ 建议由集成工程师提一个 PR 把它改成 `React.JSX.Element`（`protect-contracts` 对
`Yuminghuang738` 是放行的，合同上允许）。

**② 契约漏了 `pushToast`**（坑 #19）
`lib/api.ts` 与 `store/repoStore.ts` 都依赖它，契约却没有。这是**能直接打断构建**的缺口。
→ 建议同上，补进 `docs/renderer-contracts.md` 的 Toast 一节。

**③ 无 keyring 的 Linux 上 safeStorage 不可用，token 怎么办 —— ✅ 已定：方案 (c)**
`docs/module-signatures.md:21` 原文只写了"用 safeStorage 加密后存本地，禁止明文落盘"，
**没有覆盖「加密后端不可用」这个分支**——它和实现的关系不是"矛盾"，是"没写全"。
P3 当初按 (a) 落地（`PLAIN:` + 明文 + 告警，见 issue #9 与 PR #7），与契约字面冲突。
现已拍板改为 **(c)：加密不可用时 token 只保存在主进程内存中，一个字节都不写盘**，
契约第 21 行已同步改写。`src/main/store.ts` 的改造见 **issue #12**（P3 负责）。
⚠️ 原文此处说"`saveToken` / `getToken` 在启动路径上，抛错会让应用直接打不开"是**错的**；
`isSafeStorageAvailable()` 这个函数也不存在（正确的是 `safeStorage.isEncryptionAvailable()`）。
这两个函数都不在 `app.whenReady()` 路径上，抛错只会变成一条 toast——所以 (b) 的真正代价是
"真实模式不可用"，不是"应用打不开"。详见 issue #9 里的核实评论。

**④ `npm run format` 会重排冻结契约**（坑 #21）
`.prettierrc` 是 `semi: false`，契约带分号。目前只是"明令禁止跑"，没有根治。
→ 可选加固：在 `.prettierignore` 里加 `src/shared/`（该文件目前不存在），
或把 format 的 glob 收窄到 `!(shared)`。

---

# Part B · 交付给 6 个人：建 issue


1. 按第 1 节建 **7 个 GitHub issue**，一个 issue 对应一个人。issue 标题和正文见下表的"issue 标题"列 + 对应小节。
2. **每个 issue 的正文 = 第 1 节的《模块通用约束》+ 对应小节的《提示词》**，两个代码块连起来贴进去。
3. 每个人开工时：`git checkout main && git pull` → `git checkout -b <分支名>` → 把 issue 里的两个代码块连起来发给 AI → 让 AI 输出完整文件 → 本地跑 `npm run typecheck && npm run lint && MOCK_MODE=true npm run dev` → 自查 DoD → 提 PR。
4. **AI 每隔一段时间会"忘记"约束**。如果它开始改 `src/main/index.ts` 或 `shared/**`，直接把第 1 节的通用约束再发一遍，并补一句：「你违反了约束，请只重写 <你的文件>」。
5. PR 描述用 `.github/pull_request_template.md`。**CI 绿了就自己合并，不要等人 approve。**

### issue 一览

⚠️⚠️ **建 issue 前必读：下面的 "#1 ~ #7" 只是人数序号，不是 GitHub 上的真实 issue 号。**
GitHub 里 **issue 和 PR 共用同一个编号空间**，而本仓库已经用掉了 `#1`（GPL 协议 PR）、
`#2`（骨架 PR）、`#3`（提示词重写 PR），所以这 7 条 issue 实际会分到 **#4 ~ #10**。
不要把序号当编号用（早先六份提示词里写的"有问题在 issue #1~#6 里问"就是这么错的，
已全部改成"在你收到这份工作包的那个 issue 里问"，不再写死数字）。

| 序号 | 负责人 | GitHub 账号（设为 assignee） | issue 标题 | 分支名 | 目标文件 |
|---|---|---|---|---|---|
| 1 | P1 | `xiaoyu8745` | `[P1] 实现 github.ts：Star 拉取 / README / Release / Commit / unstar / fork` | `feat/github-你的名字` | `src/main/github.ts` |
| 2 | P2 | `xiaoran77-web` | `[P2] 实现 ai.ts：AI 摘要 / 分类 / 批量补全 / 周报文案` | `feat/ai-你的名字` | `src/main/ai.ts` |
| 3 | P3 | `Chang-66` | `[P3] 加固 store.ts 并实现 local.ts：本地存储 / Token 加密 / clone` | `feat/store-local-你的名字` | `src/main/store.ts`、`src/main/local.ts` |
| 4 | P4 | `nothing6741` | `[P4] 实现 report.ts / recommend.ts / tracker.ts：周报 / 推荐 / 定时追踪` | `feat/report-recommend-你的名字` | `src/main/report.ts`、`recommend.ts`、`tracker.ts` |
| 5 | P5 | `syeu-oss` | `[P5] 实现 Dashboard：列表 / 筛选 / 操作按钮 / ECharts 图表` | `feat/dashboard-你的名字` | `src/renderer/src/pages/Dashboard.tsx`、`components/repo/**`、`components/charts/**` |
| 6 | P6 | `zoushiying` | `[P6] 加固渲染进程公共层并实现周报页` | `feat/renderer-core-你的名字` | `src/renderer/src/store/**`、`lib/**`、`components/common/**`、`components/layout/**`、`pages/Report.tsx`、`pages/Settings.tsx`、`App.tsx` |
| 7 | P7 | `Yuminghuang738` | `[P7] 集成收口：关 Mock、端到端、录屏兜底` | `chore/integration-你的名字` | 契约文件 + 集成修复 |

模块 → 账号的对应关系同时写在 `README.md` 的「谁负责什么」表和 `.github/CODEOWNERS` 里，三处同源。

---



## 建 issue 的具体做法

```bash
# 每条 issue 的正文 = 对应文件的第 3 节『给 AI 的提示词』整块内容
# 懒人做法：直接把 prompts/pN-xxx.md 作为附件贴进 issue，或复制文件内容
gh issue create --title "[P1] 实现 github.ts：Star 拉取 / README / Release / Commit / unstar / fork" \
  --body-file prompts/p1-github.md --label "P1"
gh issue create --title "[P2] 实现 ai.ts：AI 摘要 / 分类 / 批量补全 / 周报文案" \
  --body-file prompts/p2-ai.md --label "P2"
gh issue create --title "[P3] 加固 store.ts 并实现 local.ts：本地存储 / Token 加密 / clone" \
  --body-file prompts/p3-store-local.md --label "P3"
gh issue create --title "[P4] 实现 report.ts / recommend.ts / tracker.ts：周报 / 推荐 / 定时追踪" \
  --body-file prompts/p4-report-recommend-tracker.md --label "P4"
gh issue create --title "[P5] 实现 Dashboard：列表 / 筛选 / 操作按钮 / ECharts 图表" \
  --body-file prompts/p5-dashboard.md --label "P5"
gh issue create --title "[P6] 加固渲染进程公共层并实现周报页" \
  --body-file prompts/p6-renderer-core.md --label "P6"
```

然后把这 6 个 issue 的链接发群里，附一句：「骨架已上 main，`git pull` 后按 issue 开工，
有问题在 issue 里问，每 2 小时报一次『改了哪些文件 + 卡在哪』。」

---

# Part C · Wave 2：集成收口


**分支**：`chore/integration-你的名字`
**可改文件**：全部（你是唯一不受所有权限制的人）
**触发时机**：T+8h，代码冻结之后

> 这不是一个"写代码"的 issue，而是集成手册。里面 3 个提示词块是给 AI 排错用的。

### 8.1 集成前置检查

```bash
git checkout main && git pull
git log --oneline -8

# 六个模块的 PR 是否都已合并
gh pr list --state merged --limit 10

# 骨架验收清单（本文件 Part A 第 13 节）是否仍然通过
npm ci
npm run typecheck && npm run lint && npm run build
grep -c "ipcMain.handle" src/main/index.ts      # 27
ls out/preload/                                  # index.mjs

# 契约有没有被偷改（对比冻结版本）
git log --oneline -- src/shared/ src/main/index.ts src/main/mock.ts
```

**如果 `src/shared/` 或 `src/main/index.ts` 出现在非 P7 的 commit 里** → 立刻停下来查，这是契约漂移，先修这个再谈集成。

### 8.2 关闭 Mock 的顺序（**一次只关一个，逐个验证**）

不要一次性把 `MOCK_MODE` 关掉然后开始 debug —— 那样你面对的是 6 个模块同时出错。

| 步骤 | 操作 | 验证点 |
|---|---|---|
| 1 | 填好 `.env` 的真实 `GITHUB_TOKEN`（scope 需含 `public_repo`、`read:user`） | 设置页「测试连接」显示正确的 Star 数量 |
| 2 | `MOCK_MODE=false`，只测**浏览** | 首页真实列表渲染正常；AI 字段为空但页面不崩 |
| 3 | 测 unstar（**用一个自己的测试仓库**） | GitHub 上确实取消了；列表里消失；重启后仍不在 |
| 4 | 测 fork | 按钮变「已 Fork」，链接可点，`local.forked_full_name` 已落盘 |
| 5 | 测 clone（选一个**小仓库**） | 本地真的有完整 git 仓库；「打开目录」可用 |
| 6 | 填好 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL_NAME` | 点「AI 补全分类」，观察并发为 3、界面不卡 |
| 7 | 测周报生成 | 图表有数据；AI 总结是中文且读得通 |
| 8 | 测同类推荐 | 第二次点击命中缓存（看主进程日志） |
| 9 | 单独测 tracker | `TRACKER_START` 后控制台出现 `[tracker] 同步完成 N/N` |

> 每一步失败就停下来修，**不要跳步**。跳步的代价是最后你分不清是谁的问题。

### 8.3 排错提示词

**通用排错（把报错原文贴进去）**

```text
StarPilot 是一个 Electron + electron-vite + React + TypeScript 项目，
主进程 ESM，渲染进程通过 preload 暴露的 window.api 走 IPC。

现在集成阶段出了下面的问题，请帮我定位并给出**完整可替换的文件内容**。

【现象】
<把终端报错 / 浏览器控制台报错 / 界面表现原样贴进来>

【相关代码】
<贴出涉及的文件>

【契约（不要修改）】
<贴 src/shared/types.ts 和 src/shared/ipc.ts 全文>

【约束】
- 主进程 ESM，禁止 require
- 渲染进程禁止 import src/main/**，禁止 Node API
- 不得修改 src/shared/**、src/main/index.ts、src/main/mock.ts 的导出签名
- 不得新增 npm 依赖
- 不要用省略号

请先给出**根因判断**（一句话），再给完整文件。如果根因在契约层，不要自己改契约，
改为告诉我"需要集成工程师确认：xxx"。
```

**症状 → 大概率原因对照表**

| 症状 | 先查这里 |
|---|---|
| `window.api` is undefined | `out/preload/index.mjs` 的实际文件名；`sandbox` 是否被改回 true；preload 里 `exposeInMainWorld` 是否被包在 try 里 |
| 所有 IPC 都返回 `ok:false` | `src/main/index.ts` 的包装器是否把 event 参数传给了业务函数 |
| 首页一直空列表 | `getRepos()` 的种子逻辑在 store 重构后是否失效；`MOCK_MODE` 是否读到了（看启动日志） |
| AI 相关全挂、报 400 | 有没有人在 ai.ts 里加了 `response_format: { type:'json_object' }` |
| 分类出现枚举外的值 | `classify` 的 normalize 校验是否被绕过 |
| 周报图表只有 1 个点 | `dailyStarCount` 没补 7 个连续日期；或用了 `toISOString()` 导致 key 错位 |
| unstar 后仓库"复活" | `mock.ts` 的内存态被重置了（有没有人 structuredClone 后又写回原数组）；或 index.ts 的 unstar handler 删库逻辑被覆盖掉 |
| clone 报 "git not found" | 系统 PATH 里没有 git；README 里要有说明 |
| `safeStorage` 报错、应用启动崩溃 | `decryptString` 没包 try/catch（换机器/换用户后密钥环变了） |
| 打包后白屏 | `loadFile` 路径错；或 renderer 里用了相对路径引资源 |

### 8.4 兜底与交付

```bash
# 1) 预先 clone 好演示用的仓库（现场网络慢/断网也能点"打开目录"）
#    建议挑 1~2 个体积小的，clone 到固定路径并记录在录屏脚本里

# 2) 演示前把 MOCK_MODE 切回 true，跑一遍完整闭环
#    浏览 → AI 分类 → unstar / fork / clone → 周报 → 推荐
MOCK_MODE=true npm run dev

# 3) 打 Windows 包（演示机用）
npm run build:win
#    Linux 版只需保证能构建，演示时口头说明
npm run build:linux
```

**演示前 30 分钟清单**
- [ ] `MOCK_MODE=true`，确认无需网络也能跑完整闭环
- [ ] 预 clone 的仓库路径仍存在，「打开目录」可点
- [ ] `mock-data.json` 未被误改（近 7 天 ≥12 条）
- [ ] 断网试一次：整个闭环不报错
- [ ] 录屏文件已导出到本地并验证能播放
- [ ] Pitch 材料（产品名 / Slogan / 三个核心卖点）打印或开在另一台设备上
- [ ] **准备一句免责说明**：unstar 是破坏性操作，fork 是写操作，PAT 需含 `public_repo`

### 8.5 P7 在 Wave 1 期间该做什么（别闲着）

P7 在 Wave 0 结束后会有一段空闲期，这是 7 人方案能跑通的关键缓冲：

1. **守着 CI**：谁的 PR 红了，第一时间在群里说，别让他自己摸半天。
2. **盯着契约漂移**：每次有人提 PR，扫一眼有没有动 `src/shared/`。动了就拦下来。
3. **把 `mock-data.json` 再打磨一轮**：加 2~3 条真实 star 数特别高的（让 Top5 好看），
   确认分类分布均匀。
4. **提前录一遍屏**：用骨架版录一版完整流程，后面接口全通了再录正式版。有备份不慌。
5. **写 Pitch**：产品名、Slogan、三个核心卖点。这是只有你有空做的活。
6. **准备演示机环境**：确认演示机器上有 git、Node、能跑 `npm ci`；提前把 `node_modules` 搬过去。
7. **接手 P5/P6 的接口协调**：他们互相要新字段时，由你判断是走"直接加"还是"加 IPC 通道"。

---



---

# Part D · 协作规则（发给全员，也贴在群公告）


| 事项 | 说明 |
|---|---|
| **同步节奏** | 每 2 小时在群里报一次：「改了哪些文件 + 卡在哪」。**不是报进度百分比**，而是报文件，这样 P7 才能发现漂移 |
| **不要帮别人改代码** | 发现别人模块有 bug → issue 里 @ 本人。你"顺手改一下"会让他的 PR 冲突，也可能覆盖他未提交的工作 |
| **提交前必跑** | `npm run typecheck && npm run lint`。CI 红了再回头改，比本地改慢 10 倍 |
| **AI 输出必须完整** | 如果 AI 说"其余代码不变"，直接回它：「不要用省略号，请输出完整文件内容」 |
| **AI 想改契约时** | 直接回它：「不得修改 src/shared/**，如需要新字段请单列待确认事项」 |
| **分支与提交** | 分支 `类型/模块名-名字`；commit 用 Conventional Commits（`feat(github): ...`）；禁止直接 push main；禁止 force push |
| **PR 大小** | 只包含你名下的文件。CI 的 `protect-contracts` 会拦契约文件；如果你莫名被拦，看是不是改了 `package.json` |
| **合并时机** | CI 绿了就自己合并，**不要等人 approve**（分支保护没开 require approvals） |
| **T+8h 之后** | 代码冻结，只修 bug 不加功能。要加功能先问 P7 |

### 一个自检脚本（可选，20 分钟，性价比很高）

因为没有测试框架，建议每人加一个 `scripts/selfcheck/<模块>.mjs`，
脱离 Electron 直接调用自己的函数，用 mock 数据跑一遍并打印结果。
这样改动后不需要开窗口就能自查，比手动点界面快得多。

例如 `scripts/selfcheck/report.mjs`：
```js
// 用法：node scripts/selfcheck/report.mjs
// 注意：需要一个能脱离 Electron 运行的入口，或者直接复制核心计算逻辑进来验证
console.log('weekStart/weekEnd 计算是否正确：贴出结果人工对日历')
console.log('dailyStarCount 是否 7 个连续 key：贴出 Object.keys 结果')
```
> 这只是个脚手架级的自检手段，**不要求写断言、不接入 CI**。别把时间花在建测试框架上。

