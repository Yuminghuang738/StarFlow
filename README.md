# StarPilot

> 把散落的 Star 变成一座可检索、可复盘的知识库。

一个 Electron 桌面应用：浏览和筛选你 Star 过的仓库、用 AI 自动分类和摘要、生成每周新增周报、发现相似仓库、把仓库 clone 到本地。GitHub 仓库地址是 [Yuminghuang738/StarFlow](https://github.com/Yuminghuang738/StarFlow)。

> **演示用 Mock 模式**：`MOCK_MODE=true` 时全部数据来自 `mock-data.json`，**不需要任何真实 Key、也不会碰你的 GitHub 账号**。开发时请一律用 Mock 模式，见下文。

---

## 环境要求

| 项目 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | **20.19+ 或 22.12+** | Vite 7 的硬性要求，低于此版本 `npm run dev` 起不来 |
| npm | 10+ | 随 Node 22 自带 |
| git | **必须已安装且在 `PATH` 中** | clone / fork 功能走 `simple-git`，它调的是系统 git 命令。`git --version` 能输出版本号即可 |

Linux 额外说明：如果系统没有提供 keyring，`safeStorage` 的加密能力不可用，GitHub Token **只保存在主进程内存中、不写入磁盘**，重启应用后需要到设置页重新填写（见 `src/main/store.ts` 与 issue #9）。这是刻意为之：既不让明文落盘，也不让真实模式在没有 keyring 的机器上完全不可用。

---

## 快速开始

```bash
npm install
cp .env.example .env      # 填变量，或直接留空跑 Mock
npm run dev
```

想只看假数据（推荐）：

```bash
MOCK_MODE=true npm run dev
```

### ⚠️ 首次 `npm run dev` 报 "Electron failed to install correctly"

**这是必然的，不是网络问题。** `electron@44.5.1` 的 `package.json` 里**没有 `scripts` 字段**，因此它没有 `postinstall` 钩子 —— `npm install` / `npm ci` 都不会去下载 Electron 二进制（对照 `esbuild` 就带 `postinstall`）。补一步即可：

```bash
npx install-electron --no
```

（等价于 `node node_modules/electron/install.js`；`install-electron` 是 electron 包自带的 bin。）

CI 的 `check` job 只跑 typecheck / lint / build，不需要这个二进制，所以不受影响；`npm run dev` 需要。

---

## 环境变量

5 个变量，全部在 `.env` 里（`.env` 已被 gitignore）。

| 变量 | 说明 | Mock 模式下 |
| --- | --- | --- |
| `MOCK_MODE` | `true` 时全部走 `mock-data.json`，不发起任何网络请求 | **设为 `true`** |
| `OPENAI_API_KEY` | AI 摘要 / 分类 / 周报文案用的 Key | 不需要，留空 |
| `OPENAI_BASE_URL` | 兼容 OpenAI 协议的自建网关地址；留空则走官方 | 不需要，留空 |
| `MODEL_NAME` | 模型名，如 `gpt-4o-mini` | 不需要，留空 |
| `GITHUB_TOKEN` | GitHub PAT，见下 | 不需要，留空 |

> **`MOCK_MODE=true` 时以上 4 个 Key 全部不需要填。** 演示环境请务必用 Mock 模式。

---

## GitHub PAT 需要的 scope

到 [Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) 创建一个 **classic** token，勾选：

| Scope | 为什么需要 |
| --- | --- |
| `public_repo` | **unstar 和 fork 是写操作**，没有这个 scope 会 403 |
| `read:user` | 读取你自己的 Star 列表 |

> ⚠️ **请注意这两个操作的破坏性，演示时务必说明：**
> - **unstar 是破坏性操作**：会真的取消你 GitHub 账号上对该仓库的 Star，无法通过本应用撤销。
> - **fork 是写操作**：会真的在你账号下创建一个 fork 仓库。
>
> 应用里 unstar 有二次确认弹窗，但那只防误触，不改变"操作是真的"这件事。**演示时用 Mock 模式。**

---

## 目录结构

| 目录 | 一句话 |
| --- | --- |
| `src/main/` | 主进程：GitHub 读写、本地 git、AI、存储、周报、推荐、定时追踪，以及 IPC handler 注册 |
| `src/preload/` | 唯一的跨进程桥：把 22 个 IPC 通道包成 `window.api` |
| `src/renderer/` | React 界面（Zustand 状态 + Tailwind） |
| `src/shared/` | **冻结契约**：数据结构与 IPC 通道名。**不要修改** |
| `docs/` | 冻结的模块签名契约与渲染进程契约 |
| `mock-data.json` | 全项目唯一的假数据源 |
| `out/` | 构建产物（gitignore） |

---

## 可用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发环境（热重载） |
| `npm run typecheck` | `tsc --noEmit`，只查类型不产出 |
| `npm run lint` | ESLint 全量检查 |
| `npm run build` | typecheck + 打包到 `out/` |
| `npm run build:win` | 打 Windows 安装包 |
| `npm run build:linux` | 打 Linux 安装包 |

> ⚠️ **`npm run format` 目前不要跑。** 它的 glob 是 `src/**/*.{ts,tsx,css,json}`，覆盖了 `src/shared/` 下两个**冻结契约**文件，而 `.prettierrc` 是 `semi: false`、契约文件用的是带分号的风格 —— 跑一次就会把契约整体重排，diff 一片红。这个冲突还没定（要么加 `.prettierignore`，要么把 `semi` 改成 `true`）。

---

## 给 AI 生成代码的提示

把下面这段贴给任何要改这个仓库的 AI：

> 在生成任何代码之前，先读 `src/shared/types.ts` 和 `src/shared/ipc.ts`。
> **这两个文件是冻结契约，不得修改、不得增删字段。** 需要新字段就在 PR 描述里提出来，不要自己加。
> 同理不要改 `docs/module-signatures.md` 和 `docs/renderer-contracts.md`。
> 渲染进程禁止 import `src/main/**`，禁止使用 `process` / `require` / `fs` / `path`，一切跨进程调用走 `window.api`。
> 不要新增任何 npm 依赖（版本锁定表之外的一律不加），不要跑 `npx shadcn init`，不要引入 react-router 或 radix。

---

## 团队协作

- **分支命名**：`类型/模块名-名字`，例如 `feat/report-zhangsan`、`fix/dashboard-lisi`
- **提交信息**：[Conventional Commits](https://www.conventionalcommits.org/)，例如 `feat(main): 注册全部 IPC handler`
- **PR 不要求人工 Approve**：CI 绿了就能合。CODEOWNERS 只做 @ 提醒，不强制审批
- **禁止直接 push `main`**：`main` 开了分支保护，必须走 PR 且 `ci / check` 通过
- **禁止 force push**：会冲掉别人的提交

### 谁负责什么

| 模块 | 负责人 | GitHub 账号 |
| --- | --- | --- |
| `src/shared/`、`src/preload/`、`src/main/index.ts`、`config.ts`、`mock.ts`、`mock-data.json`、渲染进程脚手架（`renderer/index.html`、`src/main.tsx`、`index.css`、`env.d.ts`）、全部配置文件 | 集成工程师（P7） | [@Yuminghuang738](https://github.com/Yuminghuang738) |
| `src/main/github.ts` | P1 | [@xiaoyu8745](https://github.com/xiaoyu8745) |
| `src/main/ai.ts` | P2 | [@xiaoran77-web](https://github.com/xiaoran77-web) |
| `src/main/local.ts`、`src/main/store.ts` | P3 | [@Chang-66](https://github.com/Chang-66) |
| `src/main/report.ts`、`recommend.ts`、`tracker.ts` | P4 | [@nothing6741](https://github.com/nothing6741) |
| `src/renderer/src/pages/Dashboard.tsx`、`components/repo/`、`components/charts/` | P5 | [@syeu-oss](https://github.com/syeu-oss) |
| `src/renderer/src/App.tsx`、`store/`、`lib/`、`components/common/`、`components/layout/`、`pages/Report.tsx`、`pages/Settings.tsx` | P6 | [@zoushiying](https://github.com/zoushiying) |

这份表也同步在 `.github/CODEOWNERS`（GitHub 用它在 PR 里 @ 到人）和各文件的头注释里，三处保持一致。

各模块的函数签名已冻结在 `docs/module-signatures.md`，骨架里是「mock 分支 + `throw NOT_IMPLEMENTED`」，直接把自己的实现填进 `throw` 的位置即可，不会互相阻塞。
