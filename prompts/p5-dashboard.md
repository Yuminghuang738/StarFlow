# P5 · Dashboard —— 你的完整工作包

> **你是 P5。这一份文件就是你全部需要的资料。**
> 前置条件：Wave 0 骨架已合入 `main`（PR #2），CI 全绿，`MOCK_MODE=true npm run dev` 能跑通「列表 → 筛选 → unstar → 周报」。
> **干净克隆后第一次跑之前，先执行 `npx install-electron --no`。** `electron@44.5.1` 的 package.json 里没有
> `scripts` 字段，所以它没有 postinstall 钩子，`npm install` / `npm ci` 都**不会**下载 Electron 二进制，
> 直接 `npm run dev` 会报 `Electron failed to install correctly`。这是必然的，不是网络问题。
> 有问题直接在你收到这份工作包的那个 issue 里问，不要私聊等回复。

---

## 1. 一句话任务

重写 Star 管理页：卡片列表、多条件筛选、四个操作按钮（含 unstar 二次确认）、语言饼图与近 7 天趋势图。

## 2. 你的地盘

| 项目 | 内容 |
|---|---|
| **可以修改/新建** | `src/renderer/src/pages/Dashboard.tsx`（整体重写）、`src/renderer/src/components/repo/**`（新建）、`src/renderer/src/components/charts/**`（新建） |
| **绝对不能改** | `store/**`、`lib/**`、`components/common/**`、`components/layout/**`、`App.tsx`（都是 P6 的），以及任何 `src/main/**`、`src/shared/**`、`package.json` |
| **分支名** | `feat/dashboard-你的名字` |
| **动手前必读** | `docs/renderer-contracts.md`、`src/renderer/src/store/repoStore.ts`、`src/renderer/src/components/common/Toast.tsx`、`src/renderer/src/components/common/ConfirmDialog.tsx` |
| **预估工时** | 3~4 小时 |

> ⚠️ **Toast 归属**：所有成功/失败的 Toast 都由 P6 的 repoStore 弹出，你一个都不要弹——你只管弹窗开关和按钮 loading 状态。
> ⚠️ 新增组件必须落在 `components/repo/` 或 `components/charts/` 下，**不要**在 `components/` 根目录建文件（那是撞车高发区）。

> 发现别人模块有 bug：issue 里 @ 他本人，**不要顺手改**。你改了他的文件，他会 PR 冲突，
> 你也可能覆盖他还没提交的工作。

## 3. 给 AI 的提示词（整块复制）

把下面这一整块复制给 AI，**同时把这些文件的全文贴在提示词后面**（AI 看不到你的仓库）：

- `src/shared/types.ts` 全文
- `docs/renderer-contracts.md` 全文
- `src/renderer/src/store/repoStore.ts` 全文
- `src/renderer/src/components/common/Toast.tsx` 与 `ConfirmDialog.tsx` 全文
- `src/renderer/src/pages/Dashboard.tsx` 当前的骨架版全文

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

请实现 StarPilot 的 Dashboard 页面与相关组件。骨架里已有一个极简版 Dashboard.tsx，请**整体重写**它。

【你可以修改/创建的文件（只有这些）】
- src/renderer/src/pages/Dashboard.tsx        （整体重写）
- src/renderer/src/components/repo/**         （新建）
- src/renderer/src/components/charts/**       （新建）

【绝对不能修改的文件】
- src/renderer/src/store/**、lib/**、components/common/**、components/layout/**、App.tsx
  这些是 P6 的文件，接口已冻结在 docs/renderer-contracts.md
- 任何 src/main/**、src/shared/**、docs/**
- package.json（禁止新增依赖）

【必须复用的既有接口（逐字使用，不要重新定义）】
- useRepoStore（Zustand）：
    repos: Repo[]
    loading: boolean
    filters: { keyword: string; language: string | null; category: AiCategory | null; onlyCloned: boolean }
    visibleRepos(): Repo[]          ← ⚠️ **不要在组件里直接调用它**，见下面「筛选结果怎么拿」
    setFilters(patch: Partial<RepoFilters>): void
    load(): Promise<void>
    refreshFromGitHub(): Promise<void>
    enrich(): Promise<void>
    unstar(fullName: string): Promise<void>
    fork(fullName: string): Promise<void>
    clone(fullName: string): Promise<void>
    openDir(path: string): Promise<void>
  ⚠️⚠️ **筛选结果怎么拿 —— 这条最容易踩坑，务必照做**
  不要写 `useRepoStore((s) => s.visibleRepos())`，也不要把它取出来再调。
  `visibleRepos()` 每次调用都**返回一个新数组**，而 zustand v5 的 useSyncExternalStore 是用
  **严格相等（Object.is）**比较快照的——每次都比出"值变了"，于是无限重渲染，页面直接卡死。
  骨架的 Dashboard.tsx 已经踩过这个坑并绕开了，原因写在那个文件的注释里（Dashboard.tsx:19-22）。
  正确做法：订阅它依赖的两个切片，用一个**纯函数**在 useMemo 里算——
      import { useRepoStore, filterRepos } from '../store/repoStore'
      const repos = useRepoStore((s) => s.repos)
      const filters = useRepoStore((s) => s.filters)
      const visible = useMemo(() => filterRepos(repos, filters), [repos, filters])
  `filterRepos(repos, filters)` 是 repoStore.ts 里**已经导出**的纯函数（它不在上面那份冻结成员清单里，
  但确实存在、可以直接 import；`visibleRepos()` 内部也是委托给它的）。骨架 Dashboard 用的就是它。
  这也是"不要自己重新定义一个筛选函数"的原因——两边逻辑必须一致。

- ⚠️ 下面这两个**已经存在**，直接用，别再造一份（都属于 P6，你只能 import 不能改）：
    import { Button } from '../components/common/Button'
      props: { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' }
             + 其余原生 button 属性（含 disabled / className / onClick）
      ⚠️ 默认 variant 是 'secondary'（slate 底色），省略 variant 时不是蓝色——
        骨架 Dashboard 现在的操作按钮就是靠这个默认值。
    import { Card } from '../components/common/Card'
      props: { className?: string; children }
      已经带好 bg-slate-900 / border-slate-800 / rounded-lg / p-4
- P6 还会新增 EmptyState / Spinner / Badge；等你开工时先看一眼 components/common/ 里有什么，
  已经有的就别重复实现（重复实现会让两个页面的空状态长得不一样）。

- import { ConfirmDialog } from '../components/common/ConfirmDialog'
    props: { open, title, description?, confirmText?, danger?, onConfirm, onCancel }
- import { useToast } from '../components/common/Toast'
    const toast = useToast()  →  toast.push({ type: 'success' | 'error', message })
    ⚠️ 但这个 issue 里你**基本用不到它**：Toast 由 repoStore 统一负责（见下面 RepoActions 的 Toast 归属规则）
- 类型从 '@shared/types' 引入：Repo, AiCategory, AI_CATEGORIES
- ⚠️ 不要自己去调用 window.api.*。所有数据操作都走 repoStore 的方法，
  这样 P6 的 loading / error 处理才能生效。

【目录划分（严格遵守，新增文件必须落在自己的前缀下）】
components/repo/
  RepoCard.tsx       单张卡片
  RepoList.tsx       列表容器（骨架屏 + 空状态）
  FilterBar.tsx      搜索框 + 语言筛选 + 分类筛选 + 只看已 clone
  RepoActions.tsx    四个操作按钮
components/charts/
  LanguagePie.tsx    语言分布饼图
  StarTrendChart.tsx 近 7 天新增趋势图

【Dashboard.tsx 结构】
⚠️ 先对齐现状：骨架 Dashboard 的标题是「Star 管理」，**没有**「从 GitHub 同步」「AI 补全分类」
两个按钮——它们现在在**设置页**（Settings.tsx）。骨架也没有图表区、没有统计卡片行、没有重置按钮。
下面这份是你的目标结构，按它重写；其中"这两个按钮放哪"由你定：搬过来、或在设置页保留、或两处都有，
但**如果搬走，要确认设置页原来那套还能用**（那是 P6 的地盘，改动前先在 issue 里跟 P6 说一声）。
1. 顶部标题栏：「我的 Star」+ 总数徽章
   + 按钮「从 GitHub 同步」→ refreshFromGitHub()（执行中禁用）
   + 按钮「AI 补全分类」→ enrich()（执行中禁用并显示"补全中…"）
2. 统计卡片一行四个：仓库总数 / 语言数 / 本周新增 / 已 clone 数
   （本周新增 = repos 里 starred_at 在最近 7 天内的数量）
3. <FilterBar />
4. 图表区：<LanguagePie /> 和 <StarTrendChart /> 并排（窄屏堆叠）
5. <RepoList />
6. useEffect(() => { void load() }, []) 挂载时加载一次

【RepoCard.tsx】
- 显示内容：
  * full_name，用 <a href={repo.html_url} target="_blank" rel="noreferrer"> 包裹
    （Electron 会交给系统浏览器打开，不要用 window.open 也不要调 shell）
  * description，为 null 时显示灰色斜体「暂无描述」
  * language 色块（自己写一个简单的颜色映射函数，相同语言颜色稳定；
    未知语言用 slate-500）
  * stargazers_count，≥1000 时格式化为 1.2k
  * ai_category 徽章；为空时显示灰色「未分类」
  * topics 前 3 个，小号 chip
  * starred_at 相对时间（如「3 天前」）
    ⚠️ P6 的工作包里被要求往 `lib/api.ts` 加 `formatRelative(iso)`，和你这里是**重复实现**。
    P6 是上游（你第 2 节里 `lib/**` 是他的地盘），所以**先看 lib/api.ts 有没有导出它**：
    有就直接 import 复用，没有（P6 还没合）再在 RepoCard.tsx 里写一个私有版本。
    两边都写一份的话，同一张卡片在不同页面的相对时间会不一致。
- 底部 <RepoActions repo={repo} />

【RepoActions.tsx —— 本 issue 的重点，请仔细实现状态机】
props: { repo: Repo }
用组件内的 useState 记录 pendingAction: string | null

⚠️⚠️【Toast 归属规则，务必遵守，否则会出现弹两次的问题】
**所有成功/失败的 Toast 都由 P6 的 repoStore 内部负责弹出，你（P5）一个 toast 都不要弹。**
你只负责两件事：① 控制 ConfirmDialog 的开关；② 维护 pendingAction 让按钮 loading/禁用。
调用 store 方法时用 try/catch 兜住异常（防止未处理的 Promise rejection 打到控制台），
catch 里**不要**再 toast，只 console.error 即可。
（例外：如果你在组件内自己调用了 window.api.*，那才需要自己 toast —— 但本 issue 禁止这么做。）

按钮一：Unstar
- 点击 → setConfirmOpen(true)（弹 ConfirmDialog，danger=true）
  标题：'确认取消 Star？'
  description：`将从你的 GitHub 账号取消 Star「${repo.full_name}」，此操作不可撤销。`
  confirmText：'取消 Star'
- 确认后：setPendingAction('unstar') → await store.unstar(repo.full_name)
  成功/失败提示由 store 负责，你只需要关闭弹窗
- finally 里把 pendingAction 置回 null

按钮二：Fork
- 直接触发，不需要二次确认
- 如果 repo.local?.forked_full_name 已存在：
    按钮文案改为「已 Fork」并**禁用**，旁边显示一个链接
    <a href={`https://github.com/${repo.local.forked_full_name}`} target="_blank">
      {repo.local.forked_full_name}
    </a>
    同时显示 forked_at 的相对时间
- 否则点击 → await store.fork(repo.full_name)（提示由 store 负责）

按钮三 / 四：Clone 与打开目录（互斥）
- 如果 repo.local?.cloned_path 存在：
    **不要渲染 Clone 按钮**，只渲染「打开目录」按钮 → await store.openDir(repo.local.cloned_path)
- 否则渲染「Clone」按钮 → await store.clone(repo.full_name)
    ⚠️ 用户在目录选择弹窗里点取消是正常操作，store 会静默返回且不弹任何提示，
    你只要不追加提示即可

通用要求：
- 任何按钮在 pendingAction === 自己时显示 loading 文案并禁用（其他按钮也要禁用，避免并发操作）
- 按钮用 <button type="button">，不要用 form 提交
- 小屏幕下按钮换行

【FilterBar.tsx】
- 搜索框：受控，值来自 filters.keyword，onChange 用 setFilters({ keyword })
  ⚠️ 受控输入直接绑 filters.keyword 会因为 store 更新导致光标跳动，
  请用本地 useState 做即时值，再用 useEffect 或防抖同步到 setFilters（延迟 200ms 即可）
- 语言下拉：选项从 repos 里动态去重得到（含 null → 显示「未知语言」），
  第一个选项是「全部语言」→ setFilters({ language: null })
- 分类下拉：选项用 AI_CATEGORIES，第一个是「全部分类」→ setFilters({ category: null })
- 复选框「只看已 clone」→ setFilters({ onlyCloned: e.target.checked })
- 一个「重置」按钮清空全部筛选

【RepoList.tsx】
- loading 为 true 且 repos 为空时：渲染 6 个骨架卡片（用 animate-pulse 的灰块）
- visibleRepos() 为空且 repos 非空时：显示「没有符合条件的仓库」+ 重置筛选按钮
- repos 为空且不 loading 时：显示「还没有数据」+ 引导去设置页同步的文案
- 否则渲染卡片网格：
    grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3
- 每张卡片给一个稳定 key（repo.id）

【图表（echarts + echarts-for-react）】
import ReactECharts from 'echarts-for-react'
⚠️ 不要用 Recharts。

LanguagePie.tsx：
- 数据：repos 按 language 聚合（null 记为「未知」），降序，取前 8，其余合并成「其它」
- 环形图：series[0].radius = ['40%', '70%']
- legend 在右侧（orient 'vertical'），tooltip 显示数量与百分比
- 用 useMemo 计算数据与 option（依赖 [repos]）
- 数据为空时渲染占位文案，不要渲染空图
- style={{ height: 280 }}

StarTrendChart.tsx：
- 近 7 天新增数，x 轴 7 个连续日期，格式 'MM-DD'
- ⚠️⚠️ 原文这段**写反了**（要求"必须用本地时间"、并禁用 toISOString），别照做。
  数据源是主进程 report.ts 产出的 `report.dailyStarCount`，它的 key 已经是**按 UTC 生成的
  'YYYY-MM-DD'**（与 `starred_at` 同口径）。渲染层只需要**按 key 顺序画**，不要在渲染进程重算日期：
      const keys = Object.keys(report.dailyStarCount).sort()   // 'YYYY-MM-DD' 字典序即时间序
  若按本地时间重新分桶，东八区晚上会把当天的 Star 算到前一天，**图上数字和周报数字对不上**。
  ⚠️ 骨架里**没有** toLocalDateKey，也**不要**新建它——`lib/**` 是 P6 的地盘。
- 日期要补零（'09-05' 不是 '9-5'）
- series 用 type 'line'，smooth true，areaStyle 用渐变（echarts.graphic.LinearGradient）
- 显示 7 个数据点、显示 symbol
- useMemo 缓存 option（依赖 [repos]）
- style={{ height: 280 }}

两个图的通用要求：
- 父容器必须有确定高度，否则 ECharts 不渲染（用固定 height 或 h-[280px]）
- 深色主题：文字用 #cbd5e1，分割线用 rgba(148,163,184,0.15)，背景透明
- 数据变化时能正确重绘（确保 useMemo 依赖里有 repos）
- 图表容器加 overflow-hidden，避免 tooltip 溢出

【样式规范】
- 只用 Tailwind 类，不要新建 CSS 文件，不要 inline style（图表高度除外）
- 统一深色配色：页面背景 slate-950，卡片 bg-slate-900，边框 border-slate-800，
  正文 text-slate-200，次要 text-slate-400
- ⚠️ **主色用 sky-600**（hover / 边框高亮用 sky-500、sky-400），**不是**原文写的 indigo-500。
  骨架里 Button.tsx 的 primary 是 `bg-sky-600`、AppShell 的选中态也是 `bg-sky-600`——
  这两个文件都在 P6 的地盘里，**你改不了**。所以你跟着用 sky 才能和侧边栏、按钮保持一致；
  硬上 indigo 的话页面里会同时出现两种主色，而且你没办法修。
- 卡片 hover：hover:border-sky-500/50 + 轻微 transition
- 所有可点元素要有 hover / focus-visible 反馈

【严禁】
- 不要 import 任何 src/main/** 或 @shared/../main/*（ESLint 会直接报错）
- 不要使用 process / require / fs / path / __dirname
- 不要新增 npm 依赖，不要引 react-router、radix、framer-motion、图标库
  （图标用内联 SVG 或文字符号）
- 不要修改 P6 的文件。如果接口真的不够用（比如想要一个 isEnriching 状态），
  **先用手头接口凑合实现**，然后在最后单列「需要 P6 确认：xxx」，不要自己去改 store。
- 不要用 any 绕过类型

需要集成工程师确认的事项，在最后单列。
```

## 4. 完成后必做

```bash
npx install-electron --no   # 干净克隆后第一次必跑，否则 npm run dev 起不来（见开头前置条件）

npm run typecheck && npm run lint

MOCK_MODE=true npm run dev
# 逐条按下面 DoD 手工点一遍，尤其是四个按钮的状态机
#
# ⚠️ 骨架里**没有**图表组件，components/charts/ 目录都要你新建；
#    echarts ^6.1.0 与 echarts-for-react ^3.0.6 已经装好了，直接 import 即可，不要再装。
```

```bash
git add -A && git commit -m "feat(dashboard): 仓库列表、筛选、操作按钮与 ECharts 图表"
git push origin feat/dashboard-你的名字
```

## 5. DoD 清单

- [ ] 首屏渲染 **31** 张卡片（mock-data.json 全量），无白屏、无控制台报错
      ⚠️ 如果控制台刷 `getSnapshot should be cached` / `Maximum update depth exceeded`，
      就是踩了上面「筛选结果怎么拿」那个坑，回去看那段。
- [ ] 语言下拉有 8+ 个选项，选中后列表正确过滤
- [ ] **7 个分类逐个点一遍，每一个都有结果**（有任何一个是空列表 → mock 分类映射漏了，@P7）
- [ ] 搜索框输入 `react` 能筛出结果，且**输入时光标不跳动**
- [ ] 三个筛选条件可以叠加生效
      ⚠️「重置按钮」是你要**新建**的，骨架里没有（现在只有搜索框 / 语言 / 分类 / 只看已 clone 四个控件）
- [ ] 「只看已 clone」在 clone 过一个仓库后能筛出它
- [ ] 语言饼图扇区数正确；趋势图有 7 个点且**日期与骨架的 UTC 口径一致**（不能差一天）
      ⚠️ 扇区数：mock 数据有 9 种语言 + 2 条 `language: null`（记为「未知」），共 **10 个 key**。
      按上面「取前 8，其余合并成『其它』」的规则会得到 **9 个扇区**——所以别写"8 个以内"，
      原文这两处自相矛盾，以「前 8 + 合并」这条规则为准。
      ⚠️ 日期：和 A 里说的一样，骨架全程用 **UTC**，别拿本机时区的日历去对（东八区深夜会差一天）。
- [ ] Unstar → 二次确认弹窗（danger 红色）→ 确认后卡片消失 + Toast
- [ ] Unstar 弹窗点取消 → 什么都不发生
- [ ] Fork → 按钮变「已 Fork」且禁用，旁边有可点击的 fork 链接
      （骨架现状：Fork 按钮文字不变，改为在卡片上渲染一个「Fork → <owner/repo>」徽章，
       数据来自 `repo.local.forked_full_name`。两种呈现都行，选一种做干净。）
- [ ] Clone → 目录选择 → 成功后 Toast 显示路径，按钮变成「打开目录」
      ⚠️ 骨架现状是 Clone 和「打开目录」**同时渲染**（`cloned_path` 存在时多出一个按钮）。
      要求是互斥，你得改。另外取消选择时 `clone()` 会抛错、`unwrap` 会弹一个错误 toast——
      下面那条「点取消不弹错误提示」要把这个路径处理掉（P6 那边也有同样的要求，先跟他对齐）。
- [ ] Clone 时点取消 → **不弹任何错误提示**
- [ ] 「打开目录」真的能打开系统文件管理器
- [ ] 操作进行中按钮禁用，不能并发点两次 Unstar
- [ ] 窗口缩到 800px 宽，布局不破、图表不溢出
- [ ] 图表在数据变化（同步后）会重绘
- [ ] `npm run build` 也过（typecheck 过了不代表打包也过）
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

