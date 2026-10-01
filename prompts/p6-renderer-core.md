# P6 · 渲染进程公共层 + 周报页 —— 你的完整工作包

> **你是 P6。这一份文件就是你全部需要的资料。**
> 前置条件：Wave 0 骨架已合入 `main`（PR #2），CI 全绿，`MOCK_MODE=true npm run dev` 能跑通「列表 → 筛选 → unstar → 周报」。
> **干净克隆后第一次跑之前，先执行 `npx install-electron --no`。** `electron@44.5.1` 的 package.json 里没有
> `scripts` 字段，所以它没有 postinstall 钩子，`npm install` / `npm ci` 都**不会**下载 Electron 二进制，
> 直接 `npm run dev` 会报 `Electron failed to install correctly`。这是必然的，不是网络问题。
> 有问题直接在你收到这份工作包的那个 issue 里问，不要私聊等回复。

---

## 1. 一句话任务

加固 repoStore / lib / components/common / layout，并完整实现周报页（含 Markdown 导出）与设置页。

## 2. 你的地盘

| 项目 | 内容 |
|---|---|
| **可以修改/新建** | `src/renderer/src/store/**`、`lib/**`、`components/common/**`、`components/layout/**`、`pages/Report.tsx`、`pages/Settings.tsx`、`App.tsx` |
| **绝对不能改** | `pages/Dashboard.tsx`、`components/repo/**`、`components/charts/**`（P5 的），以及任何 `src/main/**`、`src/shared/**`、`package.json` |
| **分支名** | `feat/renderer-core-你的名字` |
| **动手前必读** | `docs/renderer-contracts.md`、`src/renderer/src/store/repoStore.ts`、`src/shared/types.ts` |
| **预估工时** | 3~4 小时 |

> 你是 P5 的「上游」。**先把 repoStore / lib / components/common 加固好并推上去**，再去做周报页，否则 P5 会一直等你。建议顺序：A → C → B → F → G → E → D。

> 发现别人模块有 bug：issue 里 @ 他本人，**不要顺手改**。你改了他的文件，他会 PR 冲突，
> 你也可能覆盖他还没提交的工作。

## 3. 给 AI 的提示词（整块复制）

把下面这一整块复制给 AI，**同时把这些文件的全文贴在提示词后面**（AI 看不到你的仓库）：

- `src/shared/types.ts` 全文
- `src/shared/ipc.ts` 全文
- `docs/renderer-contracts.md` 全文
- `src/renderer/src/store/repoStore.ts`、`lib/api.ts`、`components/common/Toast.tsx` 当前的骨架版全文

```text
你是 Electron + TypeScript 专家，正在为 StarPilot（GitHub Star 管理桌面应用）实现一个模块。
项目骨架已经就绪并且能跑通（MOCK_MODE=true 下全流程可用），你的任务是**把指定文件里的骨架实现替换成真实实现**。

【技术栈（版本已锁死，禁止修改或升级任何版本号，禁止新增任何 npm 依赖）】
electron ^44.5.1 / electron-vite ^5.0.0 / vite ^7.3.6
react ^19.3.0 / zustand ^5.0.15 / echarts ^6.1.0 / echarts-for-react ^3.0.6 / tailwindcss ^3.4.19
octokit ^5.0.5 / openai ^7.25.0 / lowdb ^7.0.1 / simple-git ^4.0.2
node-cron ^4.6.0 / p-limit ^3.1.0（必须是 3.x，用法是 pLimit(3)）/ dotenv ^18.0.5

【骨架的既有形态（重要，不要按想象改）】
**各文件的实际形态并不一样，以你拿到的那份文件为准。** 大概是这四种之一：
  a) 纯占位（github.ts、recommend.ts、ai.ts 的大部分函数）：
       export async function xxx(...) {
         if (isMockMode()) return mockXxx(...)
         throw new Error('NOT_IMPLEMENTED: <模块>.<函数>')
       }
     → 保留 mock 分支原样不动，只把 throw 换成真实实现。
  b) mock 分支是**块语句**，里面有额外逻辑才 return，或者根本不 return：
       if (isMockMode()) { ...; return }                        例：github.ts 的 unstar
       if (isMockMode()) { const r = mockX(repo); return F(r) }  例：ai.ts 的 classify（多一层收敛兜底）
     → 整块保留，一行都别动。
  c) **骨架里就已经是真实现**，没有 isMockMode、没有 throw：store.ts 全部、report.ts 全部、
     local.ts 的 openDir。这类文件是「加固」不是「补实现」，本文件第 2 节会说明怎么处理。
  d) 条件**取反**：`if (!isMockMode()) throw ...`，mock 分支继续往下跑真实逻辑（tracker.ts 就是这样）。
**统一要求**：MOCK_MODE=true 时的可观察行为必须和改动前完全一致——这是演示兜底，不能因为你的改动而变化。

【铁律，违反视为失败】
1. 不要修改任何导出函数的名称、参数、返回类型。渲染层签名冻结在 **docs/renderer-contracts.md**
   （docs/module-signatures.md 是**主进程**的契约，不描述你要改的 store/**、components/**）。
2. 不要修改 src/shared/types.ts、src/shared/ipc.ts。
3. 不要修改 src/main/index.ts、src/main/config.ts、src/main/mock.ts、docs/**。
4. 不要修改不属于你的模块文件。**你的地盘以本文件第 2 节「你的地盘」为准**——各模块地盘不同，
   别照搬别的工作包里的说法。这句原来在六份文件里是同一段模板，而它举的两个例子对 P3 和 P6 恰好是反的：
   那两个人本来就该改那两个文件。
5. 渲染进程禁止 import 任何 src/main/**，禁止使用 process / require / fs / path / __dirname。
   主进程禁止使用 require（项目是 ESM）。
6. 不要用省略号，不要写"其余代码不变"。每个文件都要输出完整内容。
7. 不要用 any 掩盖类型问题（除了处理第三方错误对象时用 `as { status?: number }` 这类窄化）。
8. 只输出代码和必要的一句话说明。

【必须遵守的项目约定】
- 所有主进程导出函数都要有 try/catch，错误信息用**中文**，且要能指导人排查。
- 关键步骤打印日志，格式统一：console.log('[模块名] 动作', 关键参数)
- 所有 IPC 返回值最终会被包成 IpcResult，你只需要正常 return 或 throw Error。
- MOCK_MODE=true 时不允许发起任何真实网络请求（GitHub / LLM / git）。

【交付前必做】
输出完全部代码后，自己逐条回答以下检查项（是/否 + 文件与行号），任一条为否就完整重写相关文件：
1. 所有导出函数签名是否与 **docs/renderer-contracts.md** 逐字一致？
   （不是 module-signatures.md——那是主进程契约，跟你无关。）
2. mock 分支是否被完整保留？
3. 是否修改了任何不属于你的文件？
4. 是否有未处理的 null / undefined？
5. 是否存在未捕获的异常路径（网络失败、文件不存在、权限不足、用户取消）？
6. 是否使用了 require、remote、nodeIntegration，或在渲染进程用了 Node API？
7. 是否用省略号或"其余代码不变"占位？
8. 是否新增了任何 npm 依赖（必须为否）？
9. 日期/时间处理是否与既有口径一致？**本项目统一用 UTC**，与 Repo.starred_at 的 ISO 8601 口径对齐
   （见 src/main/report.ts 的 dateKey / startOfWeek，以及 local.ts 里 MOCK_CRON 的时区假设）。
   不要顺手改成"本地时间"——那会让同一份数据在不同时区算出不同的周。

【如果发现契约缺字段】
不要自行新增。在代码块末尾单列一行：
「需要集成工程师确认：xxx」
由人类决定是否修改契约后再继续。


==================================================================
【下面是你的模块专属需求】
==================================================================

请加固 StarPilot 渲染进程的公共层，并完整实现周报页面。
骨架里这些文件已有可用版本，请在其基础上完善。

【你可以修改/创建的文件（只有这些）】
- src/renderer/src/store/**            （repoStore.ts 及你新增的 slice）
- src/renderer/src/lib/**
- src/renderer/src/components/common/**
- src/renderer/src/components/layout/**
- src/renderer/src/pages/Report.tsx    （整体重写）
- src/renderer/src/pages/Settings.tsx  （完善）
- src/renderer/src/App.tsx

【绝对不能修改】
- src/renderer/src/pages/Dashboard.tsx、components/repo/**、components/charts/**（P5 的文件）
- 任何 src/main/**、src/shared/**、docs/**
- package.json（禁止新增依赖）

【冻结签名：可以新增，不能改名或删除】
docs/renderer-contracts.md 里的 **RepoStore 的 12 个成员**（原文写 13，数错了）、`unwrap`、
`ConfirmDialogProps`、`useToast`，签名一个都不能改。你**可以**新增字段
（例如 enriching、error、token 相关方法），新增后请在最后单列一行提醒 P5 和集成工程师。

⚠️⚠️ **契约文件漏了一个导出，你必须知道：`pushToast`**
`src/renderer/src/lib/api.ts:2` 和 `src/renderer/src/store/repoStore.ts:4` **都**在
`import { pushToast } from '../components/common/Toast'`。也就是说这个函数是骨架里
已经存在的**公共 API**，但 `docs/renderer-contracts.md` 的 Toast 一节只写了
`ToastItem` / `ToastProvider` / `useToast`，**没有**写 `pushToast`。
后果：如果你按契约字面"只保留这三个导出"去重写 Toast.tsx，`api.ts` 和 `repoStore.ts`
会立刻编译失败，而且一眼看不出原因（契约上看不出有谁在用）。
所以要遵守的是**两份清单的并集**：
    pushToast(t: { type: 'success' | 'error'; message: string }): void   ← 必须保留
另外 `useToast()` 在骨架里**不是** zustand hook 本身，它直接返回 `{ push: pushToast }`——
因为 `react-hooks/rules-of-hooks` 是纯静态规则，只要在非组件函数里看到 `use*` 就报错，
而契约又要求 `useToast` 能在非组件环境用。别把它"改回"真正的 hook，`unwrap` 会立刻崩。
（这条**是文档的坑，不是你的锅**：请顺手在 issue 里 @集成工程师，请他把 `pushToast`
补进 docs/renderer-contracts.md。你**不要**自己去改 docs/**，CI 会拦。）

═══════════ A. lib/api.ts 完善 ═══════════
1. 保持 export async function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T>
   语义不变：ok 为 false 时 toast 错误 + throw new Error(error)
2. 新增 export async function call<T>(p: Promise<IpcResult<T>>): Promise<T | null>
   ok 为 false 时 toast 后返回 null，**不抛错**。给"失败也不该中断流程"的场景用（推荐、摘要等）
3. 新增 export function ipcErrorMessage(err: unknown): string
   统一提取错误文案（Error → .message，其它 → String(err)，兜底 '未知错误'）
4. 新增 export function formatRelative(iso: string): string
   '刚刚' / 'N 分钟前' / 'N 小时前' / 'N 天前' / 超过 30 天显示 'YYYY-MM-DD'
   ⚠️「相对时间」本身和时区无关；超过 30 天那条**直接用 `iso.slice(0, 10)` 就行**
   （`iso` 是 UTC 的 ISO 8601，前 10 位本来就是 UTC 日期），不要为此再造一个本地时间格式化函数。
   ⚠️ P5 的 RepoCard.tsx 也要显示相对时间，他那边被要求"自己写一个 formatRelative"。
   你是上游、先落地，**请在 issue 里 @P5 告诉他直接 import 你这份**，别让他重复实现。
5. ~~新增 export function toLocalDateKey(d: Date): string~~
   ⚠️⚠️ **原文这条写反了，不要做。** 它要求"返回本地时间的 YYYY-MM-DD、禁用 toISOString()"，
   和本文件交付前自检 **第 9 条「本项目统一用 UTC」自相矛盾**。
   实际后果：周报页的柱状图吃的是主进程 `report.dailyStarCount` 的 key，那是
   `report.ts` 用 `d.toISOString().slice(0, 10)`（UTC）生成的；如果渲染层按本地时间
   重新分桶/重算日期，东八区晚上会把当天的 Star 归到前一天，**图上 7 个点会和 AI 总结里的
   新增数量对不上**。渲染层要做的只是按 key 顺序画：
       Object.keys(report.dailyStarCount).sort()   // 'YYYY-MM-DD' 字典序即时间序
   **不要新增 toLocalDateKey 这个函数，一天都不要加。**
6. 新增 export function formatStars(n: number): string
   ≥1000 → '1.2k'，≥1000000 → '1.2M'
   （P5 的卡片也要用，同样 @他一声）
7. ⚠️ 全项目所有 window.api 调用都必须经过 unwrap 或 call，
   不允许在组件里直接写 window.api.xxx().then(r => r.data)

═══════════ B. store/repoStore.ts 加固 ═══════════
1. load()：
   - 开始时 loading = true
   - 失败时 toast 错误 + **保留旧数据**（不要把 repos 清空）
   - finally 里 loading = false
2. refreshFromGitHub() —— 合并策略是本条的重点：
   - 远端数据到达后，与本地已有数据按 full_name 做合并，规则：
     * 以远端数据为基准
     * 如果本地同 full_name 的记录有 local 字段而远端没有 → 保留本地的 local
     * 如果本地有 ai_summary / ai_category 而远端没有 → 保留本地的
   - ⚠️ 如果不做这个合并，用户每次同步都会丢掉"已 Fork""已 clone""已分类"的标记，
     这是演示时最容易被发现的问题
   - 合并后调 window.api.store.saveRepos 落盘，再更新内存
3. enrich()：
   - 新增 enriching: boolean 状态
   - enriching 为 true 时直接 return（防止重复触发）
   - 调 window.api.ai.enrichRepos(repos)，用 unwrap 拆包
   - 成功替换列表；无论成功失败 finally 里都要把 enriching 置回 false
4. unstar(fullName)：
   - await window.api.github.unstar(fullName)
   - 成功后**从本地列表过滤掉**该仓库（主进程已经改了 store，这里同步内存态）
   - toast success '已取消 Star'
5. fork(fullName)：
   - const repo = await unwrap(window.api.github.fork(fullName))
   - 用返回的 Repo 替换列表里对应项，并把 local 合并进去
     （forked_full_name = repo.full_name，forked_at = new Date().toISOString()）
   - 调 window.api.store.updateLocalState(fullName, { forked_full_name: repo.full_name, forked_at })
   - toast success '已 Fork 到 ' + repo.full_name
6. clone(fullName)：
   - const dir = await unwrap(window.api.local.chooseDir())
   - ⚠️ dir 为 null 时**直接 return，不要 toast 错误**（用户取消是正常操作）
   - const path = await unwrap(window.api.local.clone(fullName, dir))
   - await window.api.store.updateLocalState(fullName, { cloned_path: path })
   - 更新内存列表里对应项的 local.cloned_path
   - toast success `已克隆到 ${path}`
7. openDir(path)：直接调用，失败时 toast 错误
8. 新增 token 相关：hasToken(): Promise<boolean>、saveToken(token: string): Promise<void>
   （saveToken 成功后 toast '已保存'）
9. 新增 error: string | null，任何操作失败时写入错误文案，供 UI 展示
10. visibleRepos() 保持派生函数；keyword 匹配 full_name + description + topics（不区分大小写）
11. 用 zustand 的 create，**不要**引入 immer / persist 中间件
12. 所有 action 都要 try/catch，不要让异常冒泡到 React 渲染层

⚠️⚠️【Toast 归属契约 —— 这一条会直接影响 P5，必须严格照做】
**repoStore 的所有 action 是本项目唯一的 Toast 出口：**
- 内部调 `unwrap(...)`：它在 `ok:false` 时**已经弹过 error toast** 并抛错
- 所以 action 的 catch 里**只写 error 字段，绝对不要再弹一次 error toast**（否则同一个错误弹两次）
- 成功路径由 action 自己弹 success toast
- **action 永远不向调用方抛错**（内部 catch 掉，写入 error 字段，正常返回）
- 这样 P5 的组件就只需要 `await store.xxx()`，不需要也不应该再弹任何 toast
请在实现完 repoStore 后，在 issue 里 @P5 明确告知这一点。

═══════════ C. components/common 完善 ═══════════
【C1】ConfirmDialog.tsx —— 保持 ConfirmDialogProps 完全不变
骨架现状（先看清再改）：Esc 关闭 ✅、点遮罩关闭 ✅、`role="dialog" aria-modal="true"` ✅
（用的是 `aria-label={title}`）；**还没有**：自动 focus、body 滚动锁、卸载还原。
- 打开时自动 focus 确认按钮
  ⚠️ 做不到就是做不到：`Button.tsx` 现在是**普通函数组件，没有 forwardRef**，
  外部拿不到 DOM 节点，`useRef` 挂在 <Button> 上会拿到 null。
  两条路：① 先给 Button 加 `forwardRef`（它是你的文件，`components/common/**`），
  ② 用 `useEffect` 在弹窗内 `querySelector('button:last-of-type')?.focus()`。
  推荐 ①，干净且对 P5 也友好。
- 加 `aria-labelledby` 时记得给标题元素一个**唯一的 id**（现在只有 `aria-label`）
- ⚠️ **不要**写死 `bg-red-600` / `bg-indigo-600`：确认按钮已经用的是 `<Button>`，
  danger 色就是它的 `variant="danger"`（`bg-red-600 hover:bg-red-500`）。
  照原文写死会把 Button 那一层的样式盖掉，而且主色骨架用的是 **sky-600 不是 indigo**。
- 打开时锁定 body 滚动：`document.body.style.overflow = 'hidden'`，关闭时还原为 `''`
- 卸载时也要还原（否则弹窗开着切走页面，整个应用永久不能滚）

【C2】Toast.tsx
- ✅ 骨架**已经**是模块级 zustand store 了（`useToastStore`），别推倒重来
- 签名要保住的**不止** ToastItem 和 useToast，还有 **`pushToast`**——见本节开头那段，
  `lib/api.ts` 和 `repoStore.ts` 都在 import 它，删了就编译不过
- 骨架现状盘点（这些**还没有**，是要你补的）：
    · 悬停暂停计时         · 最多 4 条上限     · 进出场动画
    · `remove()` 已经实现，但点击关闭的按钮没有 aria-label（可访问性）
  已经有的：3 秒自动消失 ✅、模块级 store ✅、右上角固定 ✅、success/error 配色 ✅
- 3 秒自动消失；鼠标悬停在某条上时**暂停该条的计时**
- 进入/退出动画：用一个 mounted 状态 + Tailwind transition（opacity + translate-x），
  **不要**引 framer-motion
- success 用绿、error 用红，配内联 SVG 图标
- 最多同时显示 4 条，超出丢弃最旧的
- 固定在右上角，z-index 高于 Modal

【C3】components/common 里的公共组件（⚠️ 动完在 issue 里 @P5 说明，避免他重复造）
⚠️⚠️ **先看清哪些已经存在**：`Button.tsx` 和 `Card.tsx` **骨架里已经有了**，
而且还被 `pages/Dashboard.tsx`（P5 的）、`Report.tsx`、`Settings.tsx`、`ConfirmDialog.tsx`
十几处在用。**不要按原文把它们当新文件重写**，否则会一次性弄坏四个文件。
- Button.tsx —— **加固，不是新建**。现有签名必须原样保留：
    props: { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
             size?: 'sm' | 'md' } & ButtonHTMLAttributes<HTMLButtonElement>（含 className、...rest 透传）
    ⚠️ 原文给的 props 清单**少了 `secondary`**，而 `secondary` 是**默认值**——
      骨架里 `<Button size="sm">`（Dashboard 的 Fork 按钮）就靠它。删掉会让这些按钮变成无色。
    ⚠️ 原文清单也**丢掉了 `...rest` 透传**（`extends ButtonHTMLAttributes`），
      而现有的 Settings/Report 都在传 `onClick` / `disabled` / `className`。别丢。
    你要加的只有 `loading?: boolean`（转圈 + 自动 disabled），其余保持不动。
- EmptyState.tsx：props { title: string; description?: string; action?: React.ReactNode }   ← 新增
- Spinner.tsx：props { size?: 'sm' | 'md' | 'lg' }                                          ← 新增
- Badge.tsx：props { children; tone?: 'default' | 'success' | 'warning' | 'muted' }         ← 新增
- Card.tsx —— 已存在（props { className?; children }），不用动

═══════════ D. pages/Report.tsx 完整实现 ═══════════
1. 顶部：周区间展示（weekStart ~ weekEnd，格式化成 'M月D日'）
2. 主按钮「生成本周周报」→ window.api.report.generate()（用 unwrap），生成中显示 loading
3. 生成后展示：
   a. 本周新增数量（大号数字）
   b. AI 总结段落（aiSummary），用舒适的行高和字号，不要 markdown 渲染器，直接显示文本
   c. 语言分布饼图（ECharts，环形）
      ⚠️ 这是 P5 的领域，但周报页的图表是**独立的**：
      请在 Report.tsx 内部**内联**写 option，**不要** import P5 的 components/charts/**
      （跨文件依赖会导致你们互相阻塞）
   d. 本周新增趋势柱状图（dailyStarCount，按 key 排序，7 个点）
   e. 本周新增仓库列表（newStars）—— 用你自己的简单列表，**不要** import P5 的 RepoList
   f. Top 5 项目（topRepos），带排名序号
4. 「导出 Markdown」按钮：
   - 在**渲染进程本地**把 WeeklyReport 拼成 Markdown 字符串
     ⚠️ 不要新增 IPC 通道，不要动主进程
   - 用 Blob + URL.createObjectURL + 动态创建 <a download> 触发下载
   - 文件名：`starpilot-weekly-${report.weekStart.slice(0,10)}.md`
   - 内容包含：一级标题、周区间、AI 总结、语言分布表格（| 语言 | 数量 |）、
     Top5 表格（| 排名 | 仓库 | 语言 | Star |）、本周新增列表
   - 下载后必须 URL.revokeObjectURL
5. 未生成时显示 EmptyState 引导（「点击上方按钮生成本周周报」）
6. 生成失败时显示错误文案 + 重试按钮

═══════════ E. pages/Settings.tsx 完善 ═══════════
- GitHub Token 输入框（type="password"，带显示/隐藏切换）
- 「保存 Token」按钮 → repoStore.saveToken
- 显示 hasToken 状态（「已配置」绿色 / 「未配置」灰色）
- 「从 GitHub 同步」按钮 → refreshFromGitHub()
- 「AI 补全分类」按钮 → enrich()，显示 enriching 状态
- 「测试连接」按钮：调 window.api.github.fetchStarred()，成功显示「连接正常，共 N 个 Star」，
  失败显示错误文案（这是演示前的自检入口，很重要）
- 一行固定说明：「当前运行模式由项目根目录 .env 的 MOCK_MODE 控制」
  ⚠️ 不要尝试从渲染进程读 process.env（读不到，而且被 ESLint 禁止）
- 小节标题用清晰的层级，配一段解释文字说明 Token 需要 public_repo scope，
  并醒目标注：unstar 是破坏性操作

═══════════ F. components/layout/AppShell.tsx ═══════════
骨架现状：侧边栏 `w-52`（208px）、三个导航项、选中态 `bg-sky-600`、
内容区 `min-w-0 flex-1 overflow-y-auto` ✅，且**已经内置了 `<ToastProvider>`**（见下面 G）。
要补的是 Logo SVG、版本号、「Hackathon Build」那行、以及选中态样式微调。
- 左侧固定侧边栏，宽 220px（现在是 w-52 = 208px，改不改都行，别为了这 12px 折腾）
- 顶部 Logo「StarPilot」（可以配一个内联 SVG 纸飞机）
- 三个导航项：Star 管理 / 周报 / 设置，当前项高亮
- ⚠️ **主色是 sky，不是 indigo**：骨架现在用 `bg-sky-600`，
  且 `Button.tsx` 的 primary 也是 `bg-sky-600`。原文（以及 P5 那份）写的 indigo-500
  和骨架实际情况不符——**你俩要统一到 sky**，否则页面里会同时出现两种主色。
  推荐高亮做法：`bg-sky-600 font-medium text-white`（沿用现状），需要左边框就配 `border-l-2 border-sky-400`。
- 侧边栏底部：版本号 'v0.1.0' + 一行小字「Hackathon Build」
- 内容区可滚动，overflow-y-auto，最小宽度保护（min-w-0，防止 flex 子项撑破）  ← 骨架已有
- 深色主题：bg-slate-950 / border-slate-800 / 主色 **sky-500 / sky-600**

═══════════ G. App.tsx ═══════════
骨架现状：`useState<AppTab>('dashboard')` ✅、
`<AppShell current={tab} onNavigate={setTab}>` ✅、条件渲染三个页面 ✅、
没有 react-router ✅。**基本不用改**，只有"挂载加载"这一条要斟酌。
- useState 管理 tab：'dashboard' | 'report' | 'settings'
- ⚠️⚠️ **不要包 `<ToastProvider>`**：它已经包在 `AppShell.tsx` 内部了（AppShell.tsx:19）。
  再包一层会出现**两个 toast 容器**：同一条消息渲染两遍，位置完全重叠，
  看起来像"toast 抖了一下又回来"，排查起来很费时间。
- ⚠️ AppShell 的 prop 叫 **`onNavigate`**，**不是** `onChange`（原文写错了）。
  别为了迁就原文去改 AppShell 的 prop 名——P5 的界面也挂在它上面，改了会连带碎裂。
- ⚠️ **挂载加载要斟酌**：`Dashboard.tsx` 已经在自己 mount 时 `load()`（P5 的提示词也要求保留），
  在 App.tsx 再调一次就是**同一份数据请求两遍**。两者选一，推荐**保留 Dashboard 里的**、
  App.tsx 不动（打开报告页/设置页本来也不需要仓库列表）。
  如果你坚持放在 App.tsx 统一加载 → 必须在 issue 里 @P5 让他删掉自己那份，别两边都留着。
- ⚠️ 附带提醒：三个页面是 `{tab === 'x' ? <X/> : null}` **条件渲染**，切走即卸载。
  所以 store 里的筛选条件是留得住的，但滚动位置、输入框里没提交的内容会丢。
  想改成"全挂载 + hidden 切换"会碰到 P5 的文件，**先商量，别单方面动**（DoD 里那条也点到了）。
- 不要引 react-router

【严禁】
- 不要 import 任何 src/main/**，不要使用 process / require / fs / path
- 不要新增 npm 依赖（不要 framer-motion、不要图标库、不要 react-router、不要 markdown 渲染器）
- 不要在渲染进程重新声明 window.api 的类型（用 src/preload/index.d.ts 的全局声明）
- 不要修改 P5 的文件，需要他配合时在最后单列「需要 P5 确认：xxx」

需要集成工程师确认的事项，在最后单列。
```

## 4. 完成后必做

```bash
npx install-electron --no   # 干净克隆后第一次必跑，否则 npm run dev 起不来（见开头前置条件）

npm run typecheck && npm run lint

MOCK_MODE=true npm run dev
# 按下面 DoD 手工过一遍
# ⚠️ 骨架里**没有** ECharts 依赖以外的图表封装，Report.tsx 现在只是把 JSON 打出来占位；
#    echarts ^6.1.0 与 echarts-for-react ^3.0.6 已经装好了，直接 import，不要再装。
```

```bash
git add -A && git commit -m "feat(renderer): 加固公共层与状态管理；feat(report): 周报页面与 Markdown 导出"
git push origin feat/renderer-core-你的名字
```

## 5. DoD 清单

- [ ] 三个页面都能切换；筛选条件切走再切回**还在**（它在 zustand 里，天然保住）
      ⚠️「不丢状态」只对 store 里的东西成立：页面是条件渲染、切走即卸载，
      滚动位置和输入框里没提交的内容**会**丢。原文那条写得含糊，别当成 bug 去修。
- [ ] Toast 在右上角堆叠，3 秒消失，悬停暂停，最多 4 条
      ⚠️ 同时**只有一组** toast 容器（别在 App.tsx 里再包一层 ToastProvider）
- [ ] ConfirmDialog 打开时按 Esc 能关闭，关闭后页面能正常滚动（不会卡住）
- [ ] 设置页保存 Token → 状态变「已配置」
- [ ] 设置页「测试连接」在 mock 下显示成功与数量
- [ ] 周报页点生成 → 显示新增数量、AI 总结、两个图表、新增列表、Top5
- [ ] 周报页柱状图有 7 个柱子，且 x 轴日期与 `dailyStarCount` 的 key 逐个一致
      ⚠️ 是 **UTC** 口径（key 由主进程 `report.ts` 算好），**别拿本机时区的日历去对**——
      东八区深夜两者本来就差一天，那不是 bug。详见 A 的第 5 条。
- [ ] 「导出 Markdown」真的下载了 .md 文件，用编辑器打开**中文不乱码**
- [ ] 在列表页 unstar 一个仓库，再点「从 GitHub 同步」（mock 下会返回原始列表）→
      **已 clone / 已 Fork / 已分类的标记没有丢失**（合并策略生效）
- [ ] 把 mock-data.json 临时改名，让 getRepos 返回空 → 页面不崩，显示 EmptyState
- [ ] 在浏览器 DevTools 里手动抛错触发 unwrap → 页面有 Toast 且不白屏
- [ ] `npm run build` 也过（`@shared/*` 别名在 tsc 的 paths 和 electron.vite.config.ts 里
      是两套配置，typecheck 过了不代表打包也过）
- [ ] CI 绿

---

## 6. 协作规则（必读）


| 事项 | 说明 |
|---|---|
| **同步节奏** | 每 2 小时在群里报一次：「改了哪些文件 + 卡在哪」。**不是报进度百分比**，而是报文件，这样 P7 才能发现漂移 |
| **不要帮别人改代码** | 发现别人模块有 bug → issue 里 @ 本人。你"顺手改一下"会让他的 PR 冲突，也可能覆盖他未提交的工作 |
| **提交前必跑** | `npm run typecheck && npm run lint`。CI 红了再回头改，比本地改慢 10 倍 |
| **AI 输出必须完整** | 如果 AI 说"其余代码不变"，直接回它：「不要用省略号，请输出完整文件内容」 |
| **AI 想改契约时** | 直接回它：「不得修改 src/shared/**，如需要新字段请单列待确认事项」 |
| **分支与提交** | 分支 `类型/模块名-名字`；commit 用 Conventional Commits（`feat(github): ...`）；禁止直接 push main；禁止 force push |
| **PR 大小** | 只包含你名下的文件。CI 的 `protect-contracts` 会拦契约文件；如果你莫名被拦，看是不是改了 `package.json` |
| **不要跑 `npm run format`** | 它的 glob 是 `src/**/*.{ts,tsx,css,json}`，会扫到 `src/shared/` 下两个**冻结契约**文件；而 `.prettierrc` 是 `semi: false`、契约带分号，跑一次就把契约整体重排，diff 一片红、`protect-contracts` 直接拦下。只想格式化自己的文件就指定路径 |
| **起不来先看 Electron 二进制** | `npm run dev` 报 `Electron failed to install correctly` 就执行 `npx install-electron --no`。大概率是这个原因，别去查网络 |
| **合并时机** | CI 绿了就自己合并，**不要等人 approve**（分支保护没开 require approvals） |
| **T+8h 之后** | 代码冻结，只修 bug 不加功能。要加功能先问 P7 |

### 一个自检脚本（可选，20 分钟，性价比很高）

因为没有测试框架，可以自己加一个 `scripts/selfcheck/<模块>.mjs`（**这个目录现在不存在，要你自己建**，
仓库里也还没有任何自检脚本），脱离 Electron 直接调用自己的函数，用 mock 数据跑一遍并打印结果。
这样改动后不需要开窗口就能自查，比手动点界面快得多。

> 让模块文件脱离 Electron 跑起来的关键是**打包时给 `electron` 打桩**：
> ```
> npx esbuild scripts/selfcheck/x.ts --bundle --platform=node --format=esm --packages=external \
>   --outfile=out/selfcheck.mjs --alias:electron=scripts/selfcheck/electron-stub.mjs
> ```
> 打桩文件里导出 `app.getPath`（指向临时目录）、`safeStorage`、`shell`、`BrowserWindow` 就够了。
> 两个坑：`--packages=external` 不能省（不排除 node_modules 时，dotenv 的 CJS 动态 `require('fs')`
> 会让 ESM 打包直接失败）；产物必须放在项目内（如 `out/`），否则裸模块名解析不到。
> **这仍然只是自查脚手架，不要求写断言、不接入 CI。**

例如 `scripts/selfcheck/report.mjs`：
```js
// 用法：node scripts/selfcheck/report.mjs
// 注意：需要一个能脱离 Electron 运行的入口，或者直接复制核心计算逻辑进来验证
console.log('weekStart/weekEnd 计算是否正确：贴出结果人工对日历')
console.log('dailyStarCount 是否 7 个连续 key：贴出 Object.keys 结果')
```
> 这只是个脚手架级的自检手段，**不要求写断言、不接入 CI**。别把时间花在建测试框架上。

