# StarFlow

> English version: [README.en.md](./README.en.md)

把散落在 GitHub 上的 Star 变成一座可检索、可复盘的知识库。

StarFlow 是一个基于 Electron 的桌面应用，用来管理你自己 GitHub 账号上的 starred 仓库：同步完整的 Star 列表、用 AI 自动分类并生成一句摘要、生成每周新增 Star 的周报、把仓库 clone 到本地、fork，以及根据已有的 Star 发现相似仓库。界面是本地窗口，数据也存在本地，除了 GitHub 和（可选的）AI 服务之外不经过任何第三方服务器。仓库地址：[Yuminghuang738/StarFlow](https://github.com/Yuminghuang738/StarFlow)。

---

## 解决什么问题

GitHub 自带的功能对「收藏了很多仓库的人」几乎帮不上忙：

- **Star 列表只能按时间倒序看。** 收藏几十上百个仓库之后，既不能按语言筛选，也不能按主题检索，想找「上次看到的那个 Rust 解析器」只能靠翻页。
- **Star 等于埋。** 点下 Star 的那一刻通常没有记录理由，过几周就只剩一个链接，连它解决什么问题都想不起来。
- **「我这周收藏了什么」没有现成工具。** GitHub 不提供按周汇总，想看最近新增的 Star 只能自己对着列表数。

StarFlow 的做法是把这份列表搬到本地，补上 GitHub 不提供的几层信息：

- 按关键词、语言、AI 分类、是否已 clone 筛选，把列表变成可检索的库。
- 用 AI 给每个仓库生成分类（7 个固定枚举之一）和一句中文摘要，解决「收藏了但忘了为什么」。
- 按周汇总新增 Star，生成语言分布、每日趋势和一段文字总结。
- 把仓库 clone 到本地、fork 到自己的账号，把「收藏」变成「能用」。
- 根据语言和主题找出你已经 Star 过的相似仓库。

---

## 依赖

### 运行环境

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | **20.19+ 或 22.12+** | Vite 7 与 electron-vite 5 的 `engines` 要求；低于此版本开发服务器起不来 |
| npm | 随 Node 提供 | 用到的都是标准 npm 脚本，没有额外的包管理器要求 |
| git | **已安装且在 `PATH` 中** | clone / fork 功能走 `simple-git`，它调用的是系统 git 命令 |
| 操作系统 | Windows / Linux（打包目标） | 代码本身跨平台；`electron-builder.yml` 只配置了这两个平台的目标 |

### 技术栈与依赖分组

`dependencies`（会随应用一起打包，运行期需要）：

| 类别 | 依赖 | 版本 |
| --- | --- | --- |
| 界面 | `react` / `react-dom` | `^19.3.0` |
| 界面状态 | `zustand` | `^5.0.15` |
| 图表 | `echarts` / `echarts-for-react` | `^6.1.0` / `^3.0.6` |
| GitHub | `octokit` | `^5.0.5` |
| AI | `openai` | `^7.25.0` |
| 本地 Git | `simple-git` | `^4.0.2` |
| 本地存储 | `lowdb` | `^7.0.1` |
| 定时任务 | `node-cron` | `^4.6.0` |
| 并发控制 | `p-limit` | `^3.1.0` |
| 配置读取 | `dotenv` | `^18.0.5` |

`devDependencies`（只在开发和打包时使用）：

| 类别 | 依赖 | 版本 |
| --- | --- | --- |
| 运行时与打包 | `electron` | `^44.5.1` |
| 构建 | `electron-vite` / `vite` / `@vitejs/plugin-react` | `^5.0.0` / `^7.3.6` / `^5.2.0` |
| 安装包 | `electron-builder` | `^26.15.3` |
| 语言与类型 | `typescript` / `@types/node` / `@types/react` / `@types/react-dom` | `^5.9.3` / `^22.20.4` / `^19.3.0` / `^19.3.0` |
| 样式 | `tailwindcss` / `postcss` / `autoprefixer` | `^3.4.19` / `^8.5.28` / `^10.6.1` |
| 代码质量 | `eslint` / `typescript-eslint` / `eslint-plugin-react-hooks` / `prettier` | `^9.39.5` / `^8.71.0` / `^7.1.1` / `^3.6.2` |

### 外部服务

| 服务 | 用途 | 是否必需 |
| --- | --- | --- |
| GitHub REST API | 读取 Star 列表、README、Release、提交记录；unstar；fork | 真实模式必需（Mock 模式不需要） |
| GitHub OAuth Device Flow | 「用 GitHub 登录」，免去手填 PAT | 可选；需要自行注册一个 OAuth App |
| OpenAI 兼容端点 | AI 摘要、分类、周报文案 | 可选；不配置时 AI 相关功能降级，其余功能照常 |

这些外部服务都由主进程发起，渲染进程不直接访问网络。Device Flow 被选中的原因是它**不需要 `client_secret`**，因此可以直接把 Client ID 编进公开仓库，而不必自建转发后端。

---

## 如何部署

### 本地开发

```bash
npm install
cp .env.example .env      # 按需填写，Mock 模式下可以全部留空
npx install-electron --no # 见下方说明，首次必须执行
npm run dev               # 启动 Electron + Vite 开发环境（热重载）
```

> ⚠️ **首次 `npm run dev` 如果报 "Electron failed to install correctly"**：`electron@44.5.1` 的 `package.json` 里没有 `scripts` 字段，也就没有 `postinstall` 钩子，`npm install` 不会下载 Electron 二进制。补跑一次 `npx install-electron --no`（等价于 `node node_modules/electron/install.js`）即可。CI 只跑类型检查、lint 和构建，不启动 GUI，因此不受影响。

#### 环境变量

`.env` 由 `src/main/config.ts` 读取（应用入口处 `import 'dotenv/config'`）。共 6 个键：

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `MOCK_MODE` | 为 `true` 时全部数据来自 `mock-data.json`，不发起任何网络请求 | 可选，默认 `false` |
| `GITHUB_TOKEN` | GitHub Personal Access Token，用于读取 Star 列表和写操作 | 真实模式必需（或改用应用内登录） |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App 的 Client ID，用于 Device Flow 登录 | 可选 |
| `OPENAI_API_KEY` | AI 摘要 / 分类 / 周报使用的密钥 | 可选；不填则 AI 功能降级 |
| `OPENAI_BASE_URL` | 兼容 OpenAI 协议的自建网关地址；留空走官方端点 | 可选 |
| `MODEL_NAME` | 模型名，如 `gpt-4o-mini` | 可选；留空时主进程默认用 `gpt-4o-mini` |

`MOCK_MODE` 是开发与演示开关：置为 `true` 后，Star 列表、README、Release、提交记录、AI 结果、周报全部返回 `mock-data.json`（31 条演示仓库）里的假数据，不读取任何真实 token、也不会碰你的 GitHub 账号。上面除 `MOCK_MODE` 外的其余 5 个键在 Mock 模式下都不需要填。

关于 GitHub 权限：手填的 PAT 需要 `public_repo`（unstar 和 fork 是写操作）与 `read:user`（读取自己的 Star 列表）两个 scope。Device Flow 登录使用同一组 scope。**注意 unstar 是不可撤销的破坏性操作，fork 会在你的账号下真实创建仓库**，演示时请使用 Mock 模式。

### 打包成可分发的应用

打包由 electron-builder 完成，配置在 `electron-builder.yml`，产物输出到 `dist/` 目录。

| 命令 | 作用 |
| --- | --- |
| `npm run build` | `tsc --noEmit` 类型检查 + `electron-vite build`，把主进程 / preload / 渲染进程编译到 `out/` |
| `npm run build:win` | 先 `build`，再打 Windows 安装包（NSIS）到 `dist/` |
| `npm run build:linux` | 先 `build`，再打 Linux 安装包（AppImage）到 `dist/` |
| `npm run dev` | 开发模式启动（热重载） |
| `npm run typecheck` | `tsc --noEmit`，只检查类型不产出 |
| `npm run lint` | ESLint 全量检查 |
| `npm run format` | Prettier 格式化 `src/**/*.{ts,tsx,css,json}` |

打包时 `electron-builder.yml` 只把 `out/**` 和 `package.json` 收进应用，因此 `npm run build` 必须先跑（`build:win` / `build:linux` 已经内置了这一步）。目前只配置了 Windows 与 Linux 两个目标，没有 macOS 的打包脚本。

### 数据与密钥存在哪

应用的数据放在 Electron 的 `userData` 目录，Linux 上是 `~/.config/star-flow/`。目录里保存仓库列表（含 AI 分类与摘要、clone 路径、fork 标记）、GitHub Token 和 AI 配置。Mock 模式使用单独的库文件，避免演示数据与真实数据互相污染。

密钥的安全策略：

- **GitHub Token 用 Electron 的 `safeStorage` 加密后落盘**，走系统密钥环，不会明文写入磁盘。加密能力不可用时（例如没装 keyring 的 Linux），Token 只保留在主进程内存中、一个字节都不落盘，重启应用后需要在设置页重新填写——这是刻意的取舍：宁可让用户重填，也不把明文写到磁盘上。
- **AI 的 Key 可以在 `.env` 里配，也可以直接在应用的设置页里填**，设置页填的优先于 `.env`（缺省才回落到环境变量）。它的存储设计走与 Token 相同的 `safeStorage` 加密路径（系统密钥环、不落明文），且密钥只进不出：设置页展示的配置视图类型里根本没有 `apiKey` 字段，界面上不回显密钥是类型层面就保证的。
  - 说明：这套「界面覆写 `.env`」的 IPC 通道（`store:getAiConfig` / `saveAiConfig` / `clearAiKey`）与 preload 接口已经就位，主进程侧的持久化实现在 `src/main/store.ts` 里仍标记为待补全。

---

## 项目架构

### 三进程分层

Electron 应用被拆成三层，边界是硬的：

| 进程 | 职责 | 能碰什么 |
| --- | --- | --- |
| **主进程** `src/main/` | 全部业务逻辑：GitHub 读写、AI 调用、本地 git、落盘、周报、推荐、定时追踪、OAuth 登录，以及 IPC handler 注册 | 完整的 Node API、文件系统、网络、Electron 主进程 API |
| **preload** `src/preload/` | 唯一的跨进程桥：把 41 条 IPC 通道包成类型化的 `window.api`，暴露给渲染进程 | `ipcRenderer`（只做 `invoke`），`contextBridge` |
| **渲染进程** `src/renderer/` | React 界面：列表、筛选、图表、周报页、设置页、自绘标题栏 | 只有浏览器 API 和 `window.api`；**碰不到任何 Node API** |
| **共享层** `src/shared/` | 数据结构（`types.ts`）与 IPC 通道名（`ipc.ts`）的唯一定义 | 纯类型与常量，三端都 import |

窗口用 `frame: false` 建成无边框，原生标题栏与菜单都被去掉，最小化 / 最大化 / 关闭由渲染进程的 `TitleBar` 通过 `window:minimize` 等通道驱动主进程完成。

preload 以 `contextIsolation: true`、`nodeIntegration: false` 加载。渲染进程不能 `import` 主进程代码，也不能使用 `process` / `require` / `fs` / `path`，任何跨进程调用都必须走 `window.api`。

### IPC 契约

`src/shared/ipc.ts` 与 `src/shared/types.ts` 是通道名与数据结构的唯一来源，三端都从这里 import。通道命名统一为 `模块:camelCase`，例如 `github:fetchStarred`、`local:cloneProgress`。

当前共 **41 条通道**：

| 命名空间 | 条数 | 通道 |
| --- | --- | --- |
| `github:` | 7 | `fetchStarred`、`fetchReadme`、`fetchReleases`、`fetchCommits`、`unstar`、`fork`、`star` |
| `local:` | 7 | `chooseDir`、`clone`、`openDir`、`cloneProgress`、`removeClone`、`pruneClones`、`cancelClone` |
| `ai:` | 5 | `summarize`、`classify`、`enrichRepos`、`generateReport`、`testConnection` |
| `store:` | 6 | `getRepos`、`saveRepos`、`saveToken`、`hasToken`、`updateLocalState`、`clearToken` |
| `store:`（AI 配置） | 3 | `getAiConfig`、`saveAiConfig`、`clearAiKey` |
| `report:` | 1 | `generate` |
| `recommend:` | 2 | `similar`、`forQuery` |
| `tracker:` | 2 | `start`、`stop` |
| `auth:` | 4 | `getState`、`startDeviceFlow`、`waitForLogin`、`cancelDeviceFlow` |
| `window:` | 4 | `minimize`、`toggleMaximize`、`close`、`isMaximized` |

主进程侧统一用一个 `handle()` 包装器注册：它把处理函数的返回值包成 `IpcResult<T>`（成功是 `{ ok: true, data }`，失败是 `{ ok: false, error }`），所以业务函数抛出的错误会变成一条可读的失败结果，而不是一个 reject。渲染进程侧由 `src/renderer/src/lib/api.ts` 的 `unwrap()` / `call()` 统一拆包。

**IPC 只有 `invoke`，没有主进程主动推送。** 这是本项目一个重要且贯穿整个代码库的设计约束：主进程无法在任意时刻把消息推给渲染进程，渲染进程只能「拉」。两个直接后果：

- **clone 进度靠轮询。** clone 本身是一条长时间不返回的 `invoke`，在它返回之前渲染进程什么都拿不到。于是主进程把 git 的进度行解析后缓存在内存里，单独开一条 `local:cloneProgress` 通道；渲染进程的 `CloneProgressBar` 每 300ms 拉一次。进度记录在 clone 结束后刻意保留，避免最后一次轮询读到空值导致进度条闪回。
- **窗口最大化状态靠返回值 + resize 兜底。** `window:toggleMaximize` 返回切换**之后**的状态，供图标权威更新；窗口被窗口管理器改变大小时，再靠 `window.resize` 事件兜底查询 `window:isMaximized`。

### 目录结构

| 路径 | 说明 |
| --- | --- |
| `src/main/` | 主进程。各业务模块（`github.ts` / `ai.ts` / `local.ts` / `store.ts` / `report.ts` / `recommend.ts` / `tracker.ts` / `auth.ts` / `mock.ts` / `config.ts`）与 IPC handler 注册入口 `index.ts` |
| `src/preload/` | 唯一的跨进程桥。`index.ts` 把 41 条通道包成 `window.api`，`index.d.ts` 给渲染进程补上全局类型 |
| `src/renderer/` | React 界面。`src/pages/`（Discover / Overview / Manage / Similar / Report / Settings）、`src/components/`（repo / charts / common / layout / auth / settings）、`src/store/`（Zustand）、`src/lib/`（api / theme / cn） |
| `src/shared/` | `types.ts` 定义全部数据结构，`ipc.ts` 定义通道名。三端共用的唯一契约 |
| `docs/` | 主进程模块签名（`module-signatures.md`）与渲染进程契约（`renderer-contracts.md`） |
| `scripts/selfcheck/` | 不依赖 GUI 的自检脚本（见下） |
| `mock-data.json` | 全项目唯一的假数据源，31 条演示仓库 |
| `out/` | 构建产物（已 gitignore） |
| `dist/` | electron-builder 打包产物（已 gitignore） |

> 实现状态说明：`recommend.ts`（相似仓库）与 `tracker.ts`（定时追踪）在真实模式下目前仍是占位，只在 Mock 模式下有可运行的分支；`local:cancelClone` 也暂时恒返回 `false`。其余模块在两种模式下都有实现。

### 一条数据流：从 GitHub 同步 Star 列表

以「Star 管理」页上点「从 GitHub 同步」为例，看一次调用如何穿过三进程并落盘：

1. `Manage` 的按钮触发 `repoStore.refreshFromGitHub()`。
2. store 调 `window.api.github.fetchStarred()`。这是 preload 暴露的方法，内部执行 `ipcRenderer.invoke('github:fetchStarred')`，不传任何参数。
3. 主进程的 `handle()` 包装器收到调用，丢弃第一个 `event` 参数，转到 `github.fetchStarred()`。
   - Mock 模式：直接返回 `mock-data.json` 里的数据。
   - 真实模式：用 Octokit 调 `GET /user/starred`，带 `Accept: application/vnd.github.star+json` 以拿到 `starred_at`；每页 100 条、最多 3 页，最后按 `starred_at` 倒序。
4. 结果以 `IpcResult<Repo[]>` 回到渲染进程。store 用 `mergeRepos()` 把它和本地旧数据按 `full_name` 合并，**保留本地已有的 `ai_summary` / `ai_category` / `local`（clone 路径、fork 标记）**，否则每次同步都会丢掉这些标记。
5. 合并结果再经 `store:saveRepos` 送回主进程；`store.saveRepos()` 用 lowdb 原子写入 `userData` 下的库文件，并同步更新主进程内的读缓存。
6. 渲染进程最后 `set({ repos: merged })`，列表与图表重渲染，成功提示由 store 统一弹出。

轮询类交互（clone 进度）是这条链路的镜像：渲染进程按固定间隔主动调 `local:cloneProgress`，主进程只做纯内存查询，不发起任何推送。

### 自检脚本

`scripts/selfcheck/` 放的是不依赖 Electron GUI 的自检程序，用来验证那些在界面上不好复现的边界（密钥落盘、删除本地副本的多道安全闸门、克隆进度、OAuth 状态机等）。大多数脚本在运行时自己用 esbuild 把主进程的 TS 模块打成 ESM bundle，并用打桩文件（`electron-stub.mjs`、`simple-git-stub.mjs`）替换 Electron 和 `simple-git`，从而直接在 Node 里跑；AI 相关的两个脚本读取预先打在 `out/selfcheck/` 下的 bundle。产物统一放在 `out/selfcheck/`（已 gitignore）。

```bash
node scripts/selfcheck/store-local.mjs   # store.ts / local.ts：打桩自检、真机 safeStorage、真实 clone
node scripts/selfcheck/local-manage.mjs  # 删除本地副本 + 磁盘对账
node scripts/selfcheck/clone-progress.mjs # 克隆进度的产生、透传与并发隔离
node scripts/selfcheck/auth.mjs          # OAuth Device Flow 状态机
node scripts/selfcheck/ai.mjs            # AI 分类收敛、mock 全量分布、并发上限（部分变体需真实端点）
```

端到端变体（`node scripts/selfcheck/store-local.mjs e2e`）会启动**构建产物**，用 CDP 连进渲染进程直接调 `window.api.*`，验证 preload / IPC 链路是否打通。这类脚本需要先跑 `npm run build`。自检脚本不接入 CI。
