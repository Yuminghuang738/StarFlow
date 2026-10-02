**简体中文** | [English](./README.en.md)

<div align="center">
  <img src="docs/assets/logo.png" width="128" alt="StarFlow Logo">
  <h1>StarFlow</h1>
  <h3>把散落在 GitHub 上的 Star，变成一座可检索、可复盘的知识库</h3>
  <p>Turn the stars scattered across GitHub into a searchable, reviewable knowledge base</p>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg?style=flat-square" alt="License"></a>
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-6e7681.svg?style=flat-square" alt="Platform">
    <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-44-47848f.svg?style=flat-square&logo=electron&logoColor=white" alt="Electron"></a>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square&logo=react&logoColor=white" alt="React"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-3178c6.svg?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.12%2B-339933.svg?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs welcome">
  </p>
</div>

---

## 📖 简介

**StarFlow 是一个基于 Electron 的桌面应用，用来管理你自己 GitHub 账号上的 Star 仓库。**

同步完整的 Star 列表、用 AI 自动分类并生成一句摘要、生成每周新增 Star 的周报、把仓库 clone 到本地、fork，以及根据已有的 Star 发现相似仓库。

界面是本地窗口，数据也存在本地——除了 GitHub 和（可选的）AI 服务之外，不经过任何第三方服务器。

> 仓库地址：[Yuminghuang738/StarFlow](https://github.com/Yuminghuang738/StarFlow)

### 它解决什么问题

GitHub 自带的功能对「收藏了很多仓库的人」几乎帮不上忙：

- **Star 列表只能按时间倒序看。** 收藏几十上百个仓库之后，既不能按语言筛选，也不能按主题检索，想找「上次看到的那个 Rust 解析器」只能靠翻页。
- **Star 等于埋。** 点下 Star 的那一刻通常没有记录理由，过几周就只剩一个链接，连它解决什么问题都想不起来。
- **「我这周收藏了什么」没有现成工具。** GitHub 不提供按周汇总，想看最近新增的 Star 只能自己对着列表数。

StarFlow 的做法是把这份列表搬到本地，补上 GitHub 不提供的几层信息：

| 痛点 | StarFlow 的做法 |
| --- | --- |
| 列表不可检索 | 按关键词、语言、AI 分类、活跃度、是否已 clone 筛选 |
| 收藏了但忘了为什么 | AI 给每个仓库生成分类（7 个固定枚举之一）+ 一句中文摘要 |
| 不知道本周新增了什么 | 按周汇总，生成语言分布、每日趋势与一段文字总结 |
| 收藏夹只是收藏夹 | clone 到本地、fork 到自己账号，把「收藏」变成「能用」 |
| 找不到同类项目 | 按**整份收藏**的画像推荐你还没 Star 过的新仓库，并摊开推荐理由 |

---

## ✨ 核心功能

### 🗂 把 Star 列表变成可检索的库

收藏管理页是应用的主场：一行一个仓库的横条布局，一屏能扫十几个，横向留白全部让给描述。

- **六种筛选条件**：关键词、语言、AI 分类、活跃度、是否已 clone、是否近 7 天新增。
- **四种排序**：最近收藏、星标最多、最近更新、名称 A→Z。
- **总览页的数字可以下钻**——点「已 Clone 3」，直接跳到管理页并带着对应筛选，卡片写几就筛出几条。
- **横条上直接完成动作**：Clone、Fork、取消 Star、打开本地目录、删除本地副本。

### 🤖 AI 分类与摘要

给每个仓库生成**一个固定分类**（`AI/ML` / `前端` / `后端` / `DevOps` / `工具` / `学习资源` / `其他`）和一句中文摘要，专治「收藏了但忘了为什么」。

- 分类是**封闭枚举**，不是让模型自由发挥——否则筛选项会长成一片无法收敛的长尾。
- 一份 README 就能生成摘要，点卡片上的「AI 解释」按需触发，不预先消耗额度。
- **不绑定 OpenAI**：任何 OpenAI 格式的端点都能用，设置页内置 DeepSeek / Kimi / 智谱 GLM / 通义千问 / OpenRouter / 硅基流动 / Ollama / LM Studio 预设，点一下自动填好地址和模型。本地端点不需要 API Key。

### 📊 收藏总览与每周回顾

收藏总览给出 8 项统计、语言分布、AI 分类分布与「近 7 天新增」趋势图，以及一段可选的**收藏画像**——让模型解读你的口味，而不是替你算数。

每周回顾按日历周汇总新增 Star，展示本周新版本动态、语言分布与每日趋势，并支持**一键导出 Markdown**。

> 两处「周」的口径是刻意分开的：总览说的是「近 7 天」（含今天的滚动窗口），周报说的是「本周」（周一 00:00 UTC 起）。同一个词指两扇窗会让用户对不上账，所以界面上从不混用。

### 🔍 发现仓库与为你推荐

- **发现仓库**：用一句话描述你要找什么（例如「能离线跑的中文 OCR 库」），AI 把它翻成 GitHub 搜索条件再搜，结果可以直接 Star。没配 AI Key 也能用——那种情况下直接拿你这句话去搜。
- **为你推荐**：不用挑参照仓库，应用把**整份收藏**压成画像（主要语言、高频主题、主分类、星数地板），再按画像拼查询去搜，**并且把画像显示出来**，让你知道推荐凭什么出现。点「换一批」会错开画像里排后面的语言与主题再搜一次。

### 🔐 密钥只进不出

- **GitHub Token 用 Electron 的 `safeStorage` 加密后落盘**，走系统密钥环，不会明文写入磁盘。
- 加密能力不可用时（例如没装 keyring 的 Linux），Token **只保留在主进程内存中**、一个字节都不落盘，重启后需重新填写。这是刻意的取舍：宁可让你重填，也不把明文写到磁盘上。
- AI 的 Key 同样走 `safeStorage`，且**只进不出**：设置页展示的配置视图类型里根本没有 `apiKey` 字段，界面上不回显密钥是类型层面就保证的。
- **AI 配置支持「界面覆写 `.env`」**，界面填的优先于环境变量，改完立即生效、不必重启。

### 🌗 深浅双主题 · 全平台自适应

浅色 / 深色 / 跟随系统三选一。主题在**第一次绘制之前**就定好——`index.html` 里有一段同步的防闪脚本先读 `localStorage` 再把 `.dark` 加到 `<html>` 上；走 IPC 读主进程数据库必然先按默认主题渲染一帧再翻面，那一下闪白是遮不住的。

界面在两个主题下各自取过色：主色在浅色下压暗（否则白底上发虚）、在深色下调亮（`indigo-500` 压在 `#0f172a` 上只有约 4:1 对比度）。布局在窄屏下自动折行成单列。

---

## 📸 界面截图

<table>
  <tr>
    <td width="50%" align="center"><b>收藏总览</b><br>统计卡片 · 分布图 · 趋势</td>
    <td width="50%" align="center"><b>深色主题</b><br>同一页的另一套装扮</td>
  </tr>
  <tr>
    <td><img src="docs/assets/screenshots/01-overview-light.png" alt="收藏总览（浅色）"></td>
    <td><img src="docs/assets/screenshots/02-overview-dark.png" alt="收藏总览（深色）"></td>
  </tr>
  <tr>
    <td align="center"><b>收藏管理</b><br>筛选 · 列表 · Clone / Fork</td>
    <td align="center"><b>发现仓库</b><br>一句话搜索 + 直接 Star</td>
  </tr>
  <tr>
    <td><img src="docs/assets/screenshots/03-manage-light.png" alt="收藏管理"></td>
    <td><img src="docs/assets/screenshots/04-discover-light.png" alt="发现仓库"></td>
  </tr>
  <tr>
    <td align="center"><b>为你推荐</b><br>按整份收藏的画像推荐</td>
    <td align="center"><b>每周回顾</b><br>图表 · AI 总结 · 导出</td>
  </tr>
  <tr>
    <td><img src="docs/assets/screenshots/05-similar-light.png" alt="为你推荐"></td>
    <td><img src="docs/assets/screenshots/06-report-light.png" alt="每周回顾"></td>
  </tr>
</table>

<table>
  <tr>
    <td width="26%" align="center"><b>设置</b><br>主题 · Token · AI 配置</td>
    <td width="24%" align="center"><b>窄屏 · 总览</b></td>
    <td width="24%" align="center"><b>窄屏 · 管理</b></td>
    <td width="26%" align="center"><b>架构</b></td>
  </tr>
  <tr>
    <td><img src="docs/assets/screenshots/07-settings-light.png" alt="设置页"></td>
    <td><img src="docs/assets/screenshots/08-mobile-overview-light.png" alt="窄屏总览"></td>
    <td><img src="docs/assets/screenshots/09-mobile-manage-light.png" alt="窄屏管理"></td>
    <td><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/architecture-dark.png"><img src="docs/assets/architecture-light.png" alt="三进程架构"></picture></td>
  </tr>
</table>

---

## 🚀 快速开始

### 环境要求

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | **20.19+ 或 22.12+** | Vite 7 与 electron-vite 5 的 `engines` 要求；低于此版本开发服务器起不来 |
| npm | 随 Node 提供 | 用到的都是标准 npm 脚本，没有额外的包管理器要求 |
| git | **已安装且在 `PATH` 中** | clone / fork 功能走 `simple-git`，它调用的是系统 git 命令 |
| 操作系统 | Windows / Linux（打包目标） | 代码本身跨平台；`electron-builder.yml` 只配置了这两个平台的目标 |

### 本地开发

```bash
# 1. 克隆并安装依赖
git clone https://github.com/Yuminghuang738/StarFlow.git
cd StarFlow
npm install

# 2. 准备环境变量（Mock 模式下可以全部留空）
cp .env.example .env

# 3. 首次必须补跑一次：electron@44 的 package.json 没有 scripts 字段，
#    也就没有 postinstall 钩子，npm install 不会下载 Electron 二进制
npx install-electron --no

# 4. 启动（Electron + Vite，带热重载）
npm run dev
```

> [!TIP]
> `MOCK_MODE=true` 是开发与演示开关。置为 `true` 后，Star 列表、README、Release、提交记录、AI 结果、周报**全部**返回 `mock-data.json` 里的假数据（31 条演示仓库），不读取任何真实 token、也不会碰你的 GitHub 账号。**演示请务必使用 Mock 模式**——`unstar` 是不可撤销的破坏性操作，而 `fork` 会在你的账号下真实创建仓库。

### 打包成可分发的应用

打包由 electron-builder 完成，配置在 `electron-builder.yml`，产物输出到 `dist/`。

| 命令 | 作用 |
| --- | --- |
| `npm run build` | `tsc --noEmit` 类型检查 + `electron-vite build`，编译到 `out/` |
| `npm run build:win` | 先 `build`，再打 Windows 安装包（NSIS）到 `dist/` |
| `npm run build:linux` | 先 `build`，再打 Linux 安装包（AppImage）到 `dist/` |
| `npm run dev` | 开发模式启动（热重载） |
| `npm run typecheck` | 只检查类型，不产出 |
| `npm run lint` | ESLint 全量检查 |
| `npm run format` | Prettier 格式化 `src/**/*.{ts,tsx,css,json}` |

> `electron-builder.yml` 只把 `out/**` 和 `package.json` 收进应用，因此 `npm run build` 必须先跑（`build:win` / `build:linux` 已内置这一步）。目前只配置了 Windows 与 Linux 两个目标，**没有 macOS 的打包脚本**。

### 环境变量

`.env` 由 `src/main/config.ts` 读取（应用入口处 `import 'dotenv/config'`），共 6 个键：

| 变量 | 说明 | 是否必填 |
| --- | --- | --- |
| `MOCK_MODE` | 为 `true` 时全部数据来自 `mock-data.json`，不发起任何网络请求 | 可选，默认 `false` |
| `GITHUB_TOKEN` | GitHub Personal Access Token。**当前版本不读这个键**——真实生效的 token 来自应用内「用 GitHub 登录」或设置页手填，存在本地数据文件里 | 不用填（填了也不生效） |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App 的 Client ID，用于 Device Flow 登录 | 可选 |
| `OPENAI_API_KEY` | AI 摘要 / 分类 / 周报使用的密钥 | 可选；不填则 AI 功能降级。本地端点（Ollama / LM Studio）不需要 |
| `OPENAI_BASE_URL` | 任意 OpenAI 格式端点的地址；留空走官方端点 | 可选 |
| `MODEL_NAME` | 模型名，如 `deepseek-chat`、`glm-4-plus` | 填了 `OPENAI_BASE_URL` 就**必填**；两者都留空时回落 `gpt-4o-mini` |

后三个键只是**默认值**：应用内「设置 → AI 配置」里填的优先级更高。日常改配置建议直接在界面里改，那边有预设按钮和连接测试。

### 用 GitHub 登录（可选）

应用支持 GitHub OAuth **Device Flow**，免去手填 PAT。它被选中的原因是**不需要 `client_secret`**，因此可以直接把 Client ID 编进公开仓库，而不必自建转发后端。

要启用它，自行注册一个 OAuth App 并把 Client ID 填进 `GITHUB_OAUTH_CLIENT_ID`，注册时**必须勾上 Enable Device Flow**。

> 手填的 PAT 需要 `public_repo`（unstar 和 fork 是写操作）与 `read:user`（读取自己的 Star 列表）两个 scope。Device Flow 登录使用同一组 scope。

### 数据与密钥存在哪

应用数据放在 Electron 的 `userData` 目录（Linux 上是 `~/.config/star-flow/`），保存仓库列表（含 AI 分类与摘要、clone 路径、fork 标记）、GitHub Token 和 AI 配置。**Mock 模式使用单独的库文件**，避免演示数据与真实数据互相污染。

---

## 🏗 项目架构

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/architecture-dark.png">
    <img src="docs/assets/architecture-light.png" width="880" alt="StarFlow 三进程架构">
  </picture>
</div>

### 三进程分层

Electron 应用被拆成三层，**边界是硬的**：

| 进程 | 职责 | 能碰什么 |
| --- | --- | --- |
| **主进程** `src/main/` | 全部业务逻辑：GitHub 读写、AI 调用、本地 git、落盘、周报、推荐、定时追踪、OAuth 登录，以及 IPC handler 注册 | 完整的 Node API、文件系统、网络、Electron 主进程 API |
| **preload** `src/preload/` | 唯一的跨进程桥：把 49 条 IPC 通道包成类型化的 `window.api` | `ipcRenderer`（只做 `invoke`）、`contextBridge` |
| **渲染进程** `src/renderer/` | React 界面：列表、筛选、图表、周报页、日志页、设置页、自绘标题栏 | 只有浏览器 API 和 `window.api`；**碰不到任何 Node API** |
| **共享层** `src/shared/` | 数据结构（`types.ts`）与 IPC 通道名（`ipc.ts`）的唯一定义 | 纯类型与常量，三端都 import |

窗口用 `frame: false` 建成无边框，原生标题栏与菜单都被去掉，最小化 / 最大化 / 关闭由渲染进程的 `TitleBar` 通过 `window:minimize` 等通道驱动主进程完成。preload 以 `contextIsolation: true`、`nodeIntegration: false` 加载——渲染进程不能 `import` 主进程代码，也不能使用 `process` / `require` / `fs` / `path`，任何跨进程调用都必须走 `window.api`。

### IPC 契约

`src/shared/ipc.ts` 与 `src/shared/types.ts` 是通道名与数据结构的唯一来源，三端都从这里 import。通道命名统一为 `模块:camelCase`，例如 `github:fetchStarred`、`local:cloneProgress`。

当前共 **49 条通道**：

| 命名空间 | 条数 | 通道 |
| --- | --- | --- |
| `github:` | 7 | `fetchStarred`、`fetchReadme`、`fetchReleases`、`fetchCommits`、`unstar`、`fork`、`star` |
| `local:` | 9 | `chooseDir`、`clone`、`openDir`、`cloneProgress`、`removeClone`、`pruneClones`、`cancelClone`、`checkUpdates`、`updateClone` |
| `ai:` | 7 | `summarize`、`classify`、`enrichRepos`、`enrichProgress`、`generateReport`、`testConnection`、`analyzeCollection` |
| `store:` | 6 | `getRepos`、`saveRepos`、`saveToken`、`hasToken`、`updateLocalState`、`clearToken` |
| `store:`（AI 配置） | 3 | `getAiConfig`、`saveAiConfig`、`clearAiKey` |
| `report:` | 1 | `generate` |
| `log:` | 2 | `tail`、`clear` |
| `recommend:` | 3 | `similar`、`forQuery`、`forYou` |
| `tracker:` | 2 | `start`、`stop` |
| `auth:` | 5 | `getState`、`startDeviceFlow`、`waitForLogin`、`cancelDeviceFlow`、`getUser` |
| `window:` | 4 | `minimize`、`toggleMaximize`、`close`、`isMaximized` |

主进程侧统一用一个 `handle()` 包装器注册：它把处理函数的返回值包成 `IpcResult<T>`（成功是 `{ ok: true, data }`，失败是 `{ ok: false, error }`），所以业务函数抛出的错误会变成一条可读的失败结果，而不是一个 reject。渲染进程侧由 `src/renderer/src/lib/api.ts` 的 `unwrap()` / `call()` 统一拆包。

> [!IMPORTANT]
> **IPC 只有 `invoke`，没有主进程主动推送。** 这是本项目一条贯穿整个代码库的设计约束：主进程无法在任意时刻把消息推给渲染进程，渲染进程只能「拉」。几个直接后果：
>
> - **clone 进度靠轮询。** clone 本身是一条长时间不返回的 `invoke`，在它返回之前渲染进程什么都拿不到。于是主进程把 git 的进度行解析后缓存在内存里，单独开一条 `local:cloneProgress` 通道；渲染进程的 `CloneProgressBar` 每 300ms 拉一次。进度记录在 clone 结束后刻意保留，避免最后一次轮询读到空值导致进度条闪回。
> - **窗口最大化状态靠返回值 + resize 兜底。** `window:toggleMaximize` 返回切换**之后**的状态，供图标权威更新；窗口被窗口管理器改变大小时，再靠 `window.resize` 事件兜底查询 `window:isMaximized`。
> - **AI 分类补全进度靠轮询。** 与 clone 同理：`ai:enrichRepos` 是一次跑几分钟的长驻 `invoke`，跑到第几个只有主进程知道。主进程把 `{ running, done, total }` 记在内存里，渲染进程在补全期间按 800ms 轮询 `ai:enrichProgress`，按钮上显示「补全中 12/40」。这份记录在跑完时**立刻归零**（不是停在 100%），所以界面上不会留下一条冒充"刚跑完"的残影；`total` 为 0 表示总数还未知，那时只显示「补全中…」，不拿 0 冒充进度。
> - **本地副本落后上游多少、运行日志同样靠轮询。** `local:checkUpdates` 与 `log:tail` 都是纯内存查询。前者每次进「收藏管理」页自动跑一次（同一会话 20s 内不重复打整批 `git fetch`），后者只在「运行日志」页可见时按 1.2s 轮询。

### 一条数据流：从 GitHub 同步 Star 列表

以「收藏管理」页上点「从 GitHub 同步」为例，看一次调用如何穿过三进程并落盘：

1. `Manage` 的按钮触发 `repoStore.refreshFromGitHub()`。
2. store 调 `window.api.github.fetchStarred()`。这是 preload 暴露的方法，内部执行 `ipcRenderer.invoke('github:fetchStarred')`，不传任何参数。
3. 主进程的 `handle()` 包装器收到调用，丢弃第一个 `event` 参数，转到 `github.fetchStarred()`。
   - **Mock 模式**：直接返回 `mock-data.json` 里的数据。
   - **真实模式**：用 Octokit 调 `GET /user/starred`，带 `Accept: application/vnd.github.star+json` 以拿到 `starred_at`；每页 100 条，翻到不满一页为止（上限 20 页 = 2000 条），最后按 `starred_at` 倒序。
4. 结果以 `IpcResult<Repo[]>` 回到渲染进程。store 用 `mergeRepos()` 把它和本地旧数据按 `full_name` 合并，**保留本地已有的 `ai_summary` / `ai_category` / `local`（clone 路径、fork 标记）**，否则每次同步都会丢掉这些标记。
5. 合并结果再经 `store:saveRepos` 送回主进程；`store.saveRepos()` 用 lowdb 原子写入库文件，并同步更新主进程内的读缓存。
6. 渲染进程最后 `set({ repos: merged })`，列表与图表重渲染，成功提示由 store 统一弹出。

---

## 📂 目录结构

| 路径 | 说明 |
| --- | --- |
| `src/main/` | 主进程。各业务模块（`github.ts` / `ai.ts` / `local.ts` / `store.ts` / `report.ts` / `recommend.ts` / `tracker.ts` / `auth.ts` / `mock.ts` / `config.ts`）与 IPC handler 注册入口 `index.ts` |
| `src/preload/` | 唯一的跨进程桥。`index.ts` 把 49 条通道包成 `window.api`，`index.d.ts` 给渲染进程补上全局类型 |
| `src/renderer/` | React 界面。`src/pages/`（Discover / Overview / Manage / Similar / Report / Logs / Settings）、`src/components/`（repo / charts / common / layout / auth / settings）、`src/store/`（Zustand）、`src/lib/`（api / theme / cn / enrichLabel） |
| `src/shared/` | `types.ts` 定义全部数据结构，`ipc.ts` 定义通道名。三端共用的唯一契约 |
| `docs/` | 主进程模块签名（`module-signatures.md`）与渲染进程契约（`renderer-contracts.md`），以及本文档所用的图片资源 |
| `scripts/selfcheck/` | 不依赖 GUI 的自检脚本（见下） |
| `mock-data.json` | 全项目唯一的假数据源，31 条演示仓库 |
| `out/` | 构建产物（已 gitignore） |
| `dist/` | electron-builder 打包产物（已 gitignore） |

> **实现状态**：`tracker.ts`（定时追踪）在真实模式下仍是占位，只在 Mock 模式下有可运行的分支（真实模式的 `start` / `stop` 会抛 `NOT_IMPLEMENTED`）。其余模块在两种模式下都有实现——包括 `recommend.ts`（相似仓库 / 一句话搜索 / 为你推荐）与 `local:cancelClone`（真的会中止正在跑的 clone）。

---

## 🧪 自检脚本

`scripts/selfcheck/` 放的是不依赖 Electron GUI 的自检程序，用来验证那些在界面上不好复现的边界（密钥落盘、删除本地副本的多道安全闸门、克隆进度、OAuth 状态机等）。

大多数脚本在运行时自己用 esbuild 把主进程的 TS 模块打成 ESM bundle，并用打桩文件（`electron-stub.mjs`、`simple-git-stub.mjs`）替换 Electron 和 `simple-git`，从而直接在 Node 里跑；AI 相关的两个脚本读取预先打在 `out/selfcheck/` 下的 bundle。产物统一放在 `out/selfcheck/`（已 gitignore）。

```bash
node scripts/selfcheck/store-local.mjs    # store.ts / local.ts：打桩自检、真机 safeStorage、真实 clone
node scripts/selfcheck/local-manage.mjs   # 删除本地副本 + 磁盘对账
node scripts/selfcheck/clone-progress.mjs # 克隆进度的产生、透传与并发隔离
node scripts/selfcheck/auth.mjs           # OAuth Device Flow 状态机
node scripts/selfcheck/ai.mjs             # AI 分类收敛、mock 全量分布、并发上限（部分变体需真实端点）
```

端到端变体（`node scripts/selfcheck/store-local.mjs e2e`）会启动**构建产物**，用 CDP 连进渲染进程直接调 `window.api.*`，验证 preload / IPC 链路是否打通。这类脚本需要先跑 `npm run build`。自检脚本不接入 CI。

---

## 🧰 技术栈

`dependencies`（会随应用一起打包，运行期需要）：

| 类别 | 依赖 | 版本 |
| --- | --- | --- |
| 界面 | `react` / `react-dom` | `^19.3.0` |
| 界面状态 | `zustand` | `^5.0.15` |
| 动效 | `framer-motion` | `^13.5.0` |
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

---

## ❓ 常见问题

<details>
<summary><b>首次 <code>npm run dev</code> 报 “Electron failed to install correctly”</b></summary>

`electron@44.5.1` 的 `package.json` 里没有 `scripts` 字段，也就没有 `postinstall` 钩子，`npm install` 不会下载 Electron 二进制。补跑一次即可：

```bash
npx install-electron --no   # 等价于 node node_modules/electron/install.js
```

CI 只跑类型检查、lint 和构建，不启动 GUI，因此不受影响。

</details>

<details>
<summary><b>AI 功能报「未配置 API Key」，但我已经把 Key 写进 <code>.env</code> 了</b></summary>

两个常见原因：

1. **设置页的值优先于 `.env`。** 如果之前在界面里保存过（哪怕保存的是空地址），界面值会盖住环境变量。到「设置 → AI 配置」检查一下当前生效的地址与模型。
2. **地址后缀不一定以 `/v1` 结尾。** 智谱是 `/api/paas/v4`，Gemini 兼容层是 `/v1beta`——以服务商文档为准。填了 `OPENAI_BASE_URL` 就**必须**填 `MODEL_NAME`，各家模型名不一样，没有通用默认值。

本地端点（Ollama、LM Studio）**不需要 Key**。设置页的「测试连接」按钮会走一次极简调用并把错误分类成人话返回，比反复猜配置快得多。

</details>

<details>
<summary><b>Clone 进度条不动，或者卡在 100%</b></summary>

进度靠渲染进程每 300ms 轮询 `local:cloneProgress` 取得，而主进程的进度记录**在克隆结束后是刻意保留的**——那是为了不让进度条在收尾那一刻闪回空白。

因此界面只在**这次克隆真的开跑之后**才去读那条记录（`cloningFullName` 字段）。如果你看到一条 100% 的满进度配着上一次的用时，那是前一次克隆留下的记录，不是这次卡住了。

</details>

<details>
<summary><b>推荐页一直是空的</b></summary>

「为你推荐」和「发现仓库」都需要 GitHub Token。**Mock 模式**下不需要，但真实模式下没有 Token 就搜不出东西。

另外 GitHub 的**搜索接口限频很紧**（认证后 30 次/分钟）。应用已经把「为你推荐」改成串行最多 3 条查询，但短时间内反复点「换一批」仍然可能撞上 403——稍等一下再试即可。

</details>

<details>
<summary><b>删除本地副本会不会误删我别的目录？</b></summary>

不会。`local:removeClone` **刻意只收 `fullName`、绝不收路径**：路径由主进程从自己的数据库里查出来，渲染进程没有机会把任意路径交给 `rm`。并且有多道安全闸门——主进程会校验该路径确实是自己记录过的克隆目录，越界一律拒绝。删除后主进程返回**实际被删掉的路径**，界面用它显示提示。

</details>

---

## 🤝 参与贡献

欢迎提 Issue 与 PR。改动前建议先读这两份文档，它们记录了各模块的签名与契约：

- [`docs/module-signatures.md`](docs/module-signatures.md) —— 主进程各模块的接口与实现约束
- [`docs/renderer-contracts.md`](docs/renderer-contracts.md) —— 渲染进程组件的契约

`src/shared/types.ts` 与 `src/shared/ipc.ts` 是**冻结契约**，新增字段或通道请在 PR 描述里说明理由，不要自行修改。

提交前请确保以下三项通过：

```bash
npm run typecheck
npm run lint
npm run build
```

---

## 📄 许可证

[GPL-3.0](./LICENSE)
