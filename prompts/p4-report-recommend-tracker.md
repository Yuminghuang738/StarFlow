# P4 · report.ts / recommend.ts / tracker.ts —— 你的完整工作包

> **你是 P4。这一份文件就是你全部需要的资料。**
> 前置条件：Wave 0 骨架已合入 `main`（PR #2），CI 全绿，`MOCK_MODE=true npm run dev` 能跑通「列表 → 筛选 → unstar → 周报」。
> **干净克隆后第一次跑之前，先执行 `npx install-electron --no`。** `electron@44.5.1` 的 package.json 里没有
> `scripts` 字段，所以它没有 postinstall 钩子，`npm install` / `npm ci` 都**不会**下载 Electron 二进制，
> 直接 `npm run dev` 会报 `Electron failed to install correctly`。这是必然的，不是网络问题。
> 有问题直接在你收到这份工作包的那个 issue 里问，不要私聊等回复。

---

## 1. 一句话任务

周报聚合（周区间 + 图表数据完整性）、同类推荐（带缓存，防 30 次/分钟限流）、定时追踪（node-cron，幂等）。

## 2. 你的地盘

| 项目 | 内容 |
|---|---|
| **可以修改/新建** | `src/main/report.ts`、`src/main/recommend.ts`、`src/main/tracker.ts` |
| **绝对不能改** | 其他一切文件，特别是 `src/main/index.ts`、`src/main/store.ts`、`src/main/github.ts`、`src/main/ai.ts`、`src/shared/**`、`docs/**` |
| **分支名** | `feat/report-recommend-你的名字` |
| **动手前必读** | `src/shared/types.ts`（`WeeklyReport` 是关键）、`docs/module-signatures.md` |
| **预估工时** | 2~2.5 小时 |

> 你是「消费者」：会调用 P1 的 `github.*`、P2 的 `ai.generateReport`、P3 的 `store.*`。签名已冻结，**不需要等他们做完**。⚠️ 最容易错的是日期：绝不能用 `toISOString().slice(0,10)`，东八区会整体差一天。

> 发现别人模块有 bug：issue 里 @ 他本人，**不要顺手改**。你改了他的文件，他会 PR 冲突，
> 你也可能覆盖他还没提交的工作。

## 3. 给 AI 的提示词（整块复制）

把下面这一整块复制给 AI，**同时把这些文件的全文贴在提示词后面**（AI 看不到你的仓库）：

- `src/shared/types.ts` 全文
- `src/shared/ipc.ts` 全文
- `docs/module-signatures.md` 全文
- `src/main/report.ts`、`recommend.ts`、`tracker.ts` 当前的骨架版全文

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
1. 不要修改任何导出函数的名称、参数、返回类型。签名冻结在 docs/module-signatures.md。
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
1. 所有导出函数签名是否与 docs/module-signatures.md 逐字一致？
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

请加固 src/main/report.ts，并实现 src/main/recommend.ts 和 tracker.ts 的真实逻辑。

═══════════ A. report.ts ═══════════
骨架版已有一版可用逻辑，请逐条核对修正，重点是**日期计算**和**图表数据完整性**。

【A1】周区间计算
⚠️⚠️ **原文这一段写反了，照着改会引入 bug。先读完再动手。**
原文要求「本地时间」并「不要用 UTC 取巧」。但骨架 report.ts 全用 **UTC，而且是对的**：
  · `Repo.starred_at` 是 GitHub 给的 ISO 8601 **UTC** 字符串（骨架 types.ts 里明确标注了）
  · 骨架的 dateKey 用 `d.toISOString().slice(0, 10)`，startOfWeek 用
    `Date.UTC` / `getUTCDay` / `setUTCDate`
如果按原文改成"本地时间"，就变成**用本地时间的周边界去筛 UTC 时间戳**——两种口径混用。
演示机换个时区，同一份数据算出来的周区间和新增数就不一样，那才是"整体差一天"的真正来源。

**保持 UTC。** 骨架现状就是正确的，不要动：
    /** 本周一 00:00:00.000（UTC；与 starred_at 的存储口径保持一致） */
    function startOfWeek(now: Date): Date {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const dow = d.getUTCDay() // 0 = 周日
      d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
      return d
    }
- weekStart = 本周一 00:00:00.000 UTC
- weekEnd   = weekStart + 7 天 - 1ms（周日 23:59:59.999 UTC）
- 都输出 ISO 8601：toISOString()

【A2】newStars
- starred_at 落在 [weekStart, weekEnd] 闭区间内的仓库
- 按 starred_at 倒序（最新在前）

【A3】languageStats
- ⚠️ 用**全部仓库**聚合，不是只算本周的。这是给饼图用的，只有本周数据会非常难看
- language 为 null 时记为 '未知'
- 返回 Record<string, number>

【A4】dailyStarCount —— 这是最容易出错的地方
- 最近 7 天（含今天），key 为 'YYYY-MM-DD'，value 为当天新增数
- ⚠️ 必须补齐 7 个连续日期，没有新增的日期补 0
- ⚠️ key 的顺序必须从早到晚（ECharts 的 x 轴直接吃 Object.keys，缺日期或乱序图就废了）
- ⚠️ 'YYYY-MM-DD' 用 **UTC** 格式化（同 A1 的理由，口径要和 starred_at 一致）。
  骨架里就是这样，**保持不动**：
    function dateKey(d: Date): string {
      return d.toISOString().slice(0, 10)
    }
  （原文要求改用本地时间的 toLocalDateKey、并禁用 toISOString().slice(0,10)——那是反的：
   按本地时间算出来的 key 会和 starred_at 的 UTC 日切差一天，那才是 bug。别按原文改。）
- 生成这 7 个 key，骨架是这样（UTC 起点 + 毫秒减法，共 7 个，从 6 天前排到今天）：
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    for (let i = 6; i >= 0; i--) {
      dailyStarCount[dateKey(new Date(todayStart - i * DAY))] = 0
    }
  （原文说"不要用毫秒减法、夏令时会导致偏移"——那条只在用**本地时间**构造时才成立。
   这里是 UTC 毫秒减法，一天恒为 86400000ms，没有夏令时问题。）

【A5】topRepos
- 按 stargazers_count 倒序取前 5（用全部仓库，不是只算本周）

【A6】aiSummary   ← ⚠️ 第二条是**要改的**，不是现状
- newStars 非空时 await ai.generateReport(newStars)        ← 骨架已实现
- newStars 为空时**不要调用模型**，直接赋值 '本周没有新增 Star。'
  ⚠️ 骨架现状是**无条件**调用 `await ai.generateReport(newStars.map((r) => r))`，
  空数组也照样打模型；而且源码里**根本没有** '本周没有新增 Star。' 这个兜底串。
  这一条要你补上。

【A7】空列表兜底   ← ⚠️ 骨架**没有任何空列表特判**，这是要你补的
- repos 为空时返回结构完整的 WeeklyReport：
  newStars: []、languageStats: {}、dailyStarCount: 仍然补齐 7 个 0、topRepos: []、
  aiSummary: '本周没有新增 Star。'
- 任何一个字段都不能是 undefined（前端会直接崩）

【A8】导入方式
    import * as ai from './ai'
    import * as store from './store'
    import type { WeeklyReport } from '@shared/types'
  ⚠️ 骨架的 report.ts 只 import 了 WeeklyReport，**没有** Repo（确实用不到）。
  原文把两个都写上了，需要 Repo 时再加。

═══════════ B. recommend.ts ═══════════
export async function similar(fullName: string): Promise<Repo[]>
保留 mock 分支，实现真实逻辑。

【B1】缓存（必须做）
GitHub Search API 只有 30 次/分钟的限额，不加缓存演示时会直接 403。
    const cache = new Map<string, { at: number; data: Repo[] }>()
    const TTL = 10 * 60 * 1000
- 命中且未过期（Date.now() - at < TTL）→ 直接返回，并 console.log('[recommend] 命中缓存 <fullName>')
- 未命中 → 查询后写入
- Map 大小超过 100 时，删除最早插入的那个（Map 的 keys().next().value 就是最旧的）
- 缓存 key 用 fullName

【B2】拿到目标仓库
- 从 await store.getRepos() 里找 full_name === fullName 的那条
- 找不到时 throw new Error(`未找到仓库：${fullName}（请先同步 Star 列表）`)

【B3】构造搜索词，按优先级降级
    const lang = target.language
    const topic = target.topics[0]
    const 候选 = []
    if (lang && topic) 候选.push(`language:${lang} topic:${topic}`)
    if (lang)          候选.push(`language:${lang} stars:>500`)
    if (topic)         候选.push(`topic:${topic} stars:>500`)
    候选.push('stars:>1000')       // 兜底，保证一定有结果
- 依次尝试，第一个返回非空结果的就用
- 用 octokit.rest.search.repos({ q, sort: 'stars', order: 'desc', per_page: 20 })
  token 从 store.getToken() 拿，没有 token 时 throw new Error('未配置 GitHub Token')
  ⚠️ 原文说「用和 github.ts 相同的 client 模式：模块级缓存 Octokit 实例」——**没有这回事**：
  骨架的 github.ts 全文只有 mock 分支 + throw，**一行 Octokit 都没有**（P1 还没开工），
  没有现成模式可抄。自己按下面这个写法做缓存即可：
      let cachedToken: string | null = null
      let cachedOctokit: Octokit | null = null
      async function client(): Promise<Octokit> { /* token 变了就重建 */ }
  P1 完成后两边写法最好统一，届时在群里对一下。
- Octokit 版本是 ^5：import { Octokit } from 'octokit'

【B4】过滤
- 排除自己（full_name 相同）
- 排除已经在 store.getRepos() 里的仓库（不要推荐已经 star 过的）
- 用 Set 做 O(1) 判断

【B5】映射成 Repo，字段严格按 types.ts
- id / full_name / description ?? null / language ?? null / stargazers_count ?? 0 / html_url
- starred_at: new Date().toISOString()（推荐结果不是真的 star 过，用一个占位时间）
- topics: Array.isArray(item.topics) ? item.topics : []
- pushed_at: item.pushed_at ?? null
- latest_release: null

【B6】取前 4 条，写入缓存后返回

【B7】失败降级
- 搜索失败（包括 403 限流）时**返回空数组**，不要抛错。
  推荐是锦上添花的功能，不能让首页报错。console.error 记录即可。

═══════════ C. tracker.ts ═══════════
export function start(): void / export function stop(): void

⚠️ tracker.ts 是**第四种**骨架形态（条件取反），别按通用模板去找 mock 分支：
    export function start(): void {
      if (!isMockMode()) { throw new Error('NOT_IMPLEMENTED: tracker.start') }
      if (task) return
      task = cron.schedule(MOCK_CRON, () => { console.log('[tracker] mock tick') })
    }
也就是说：**mock 下真的用 node-cron 起了一个任务**，只是任务体里只打日志；真实分支才是 throw。
所以"保留 mock 分支"在这里的含义是：**mock 下那套真实调度行为要保持原样**，不是"mock 下只 console.log"。

【C1】任务句柄
⚠️ 骨架用的是具名类型导入，不是命名空间形式，跟着骨架走：
    import cron, { type ScheduledTask } from 'node-cron'
    let task: ScheduledTask | null = null

【C2】start()
- 幂等：if (task) { console.log('[tracker] 已在运行'); return }   ← 骨架已实现（只是没打日志）
- 表达式：骨架里抽成了常量 `MOCK_CRON = '*/5 * * * *'`，注释说明是**每 5 分钟**、为的是演示时
  能看见 tick。原文写的 '0 */2 * * *'（每 2 小时）**和骨架常量不一致**——以骨架为准；
  真实分支要改成每天跑就改这里，但改完**必须确认 mock 的可观察行为没变**。
- 先用 cron.validate(表达式) 校验，不合法就 console.error 并 return
- task = cron.schedule(表达式, () => { void tick() })
- ⚠️ 原文要求"启动时立刻先跑一次 void tick()"——骨架里**没有**这一步，也**没有 tick 函数**
  （见 C4），启动后只会等第一个 cron 触发。要不要立即跑一次由你定，但别改掉 mock 行为。
- 日志：'[tracker] 已启动，每 N 分钟同步一次'   ← 骨架只在 tick 里打 '[tracker] mock tick'

【C3】stop()
- if (!task) return（重复调用必须安全）
- task.stop()
- 骨架用的是 `void task.destroy()`（node-cron 4.x 里 destroy 才是真停掉并释放资源）
- task = null      ← 骨架已实现
- 日志：'[tracker] 已停止'

【C4】tick()   ← ⚠️ 骨架里**不存在**这个函数，需要你从零新增
（原文整段是一份实现建议，不是现状描述。骨架的 mock 任务体只有一行 console.log。）
    async function tick(): Promise<void> {
      const repos = await store.getRepos()
      if (repos.length === 0) { console.log('[tracker] 没有仓库，跳过'); return }
      const targets = repos.slice(0, 30)       // 保护速率限制
      if (repos.length > 30) console.log(`[tracker] 共 ${repos.length} 个仓库，本次只同步前 30 个`)
      const limit = pLimit(3)                  // import pLimit from 'p-limit'，v3 写法
      let ok = 0
      const updated = await Promise.all(targets.map((r) => limit(async () => {
        try {
          const releases = await github.fetchReleases(r.full_name)
          await github.fetchCommits(r.full_name)   // 目前仅用于验证连通性，不写入
          ok += 1
          return { ...r, latest_release: releases[0] ?? null }
        } catch (err) {
          console.error(`[tracker] 同步失败 ${r.full_name}:`, err instanceof Error ? err.message : err)
          return r
        }
      })))
      // 没被 targets 覆盖的仓库原样保留
      const rest = repos.slice(30)
      await store.saveRepos([...updated, ...rest])
      console.log(`[tracker] 同步完成 ${ok}/${targets.length}`)
    }
- ⚠️ 单条失败只记录并跳过，绝不能让整个 tick 崩掉
- ⚠️ 不要往 Repo 上塞 types.ts 里没有的字段
- ⚠️ 不要用 setInterval 代替 node-cron
- ⚠️ 不要用 Promise.all 裸并发全部仓库

【严禁（三个文件共同）】
- 不要修改 src/main/index.ts、store.ts、github.ts、ai.ts、mock.ts、config.ts、shared/**、docs/**
- 不要让 tracker 在模块加载时自动启动（必须由 TRACKER_START 显式触发）
- 不要新增 npm 依赖
- **日期 key 用 toISOString().slice(0,10)（UTC），不要改成按本地时间格式化**（见 A1/A4，
  原文这一条写反了）

需要集成工程师确认的事项，在最后单列。
```

## 4. 完成后必做

```bash
npx install-electron --no   # 干净克隆后第一次必跑，否则 npm run dev 起不来（见开头前置条件）

npm run typecheck && npm run lint

# 周报数据自查（MOCK_MODE=true，不需要任何真实 Key）
MOCK_MODE=true npm run dev
#   → 周报页点「生成本周周报」，检查：
#     dailyStarCount 的 key 恰好 7 个、连续、从早到晚
#     languageStats 有 8+ 个 key（实测 10 个：9 种语言 + '未知'）
#     newStars 数量 > 0

# ⚠️ 下面两条**现在做不了**，别浪费时间找按钮：
#   · 「同类推荐」按钮在渲染进程里**不存在**（grep 全仓无命中），要等 P5/P6 把它做出来；
#     在它出现之前，只能自己调 recommend.similar() 或看主进程日志验证缓存。
#   · TRACKER_START **没有任何 UI 入口**——IPC 和 preload 都通了，但渲染进程里没人调它。
#     要手工验证得自己在 DevTools 控制台里 `window.api.tracker.start()`。
#   （这两条是骨架的已知缺口，属于 P6 的活；别当成 P4 的 bug。）
```

```bash
git add -A && git commit -m "feat(report): 周报聚合与图表数据；feat(recommend): 同类推荐与缓存；feat(tracker): 定时追踪"
git push origin feat/report-recommend-你的名字
```

## 5. DoD 清单

- [ ] `report.generate()` 返回的 `dailyStarCount` **恰好 7 个 key**、日期连续、从早到晚（贴到 PR 里）
- [ ] `dailyStarCount` 的日期与 **UTC** 的"今天"一致（骨架全用 UTC，见 A1/A4；
      ⚠️ 别拿本机时区的日历去对，东八区深夜时两者本来就差一天，那不是 bug）
- [ ] `languageStats` 的 key 覆盖 8 种以上语言，包含 `未知`（因为 mock 数据有两条 language 为 null）
- [ ] 在周一凌晨 / 周日深夜这类边界情况下手动验算一次周区间（改系统时间或用假数据）
- [ ] `newStars` 数量与 mock 数据在**本周**（周一~周日，UTC）内的条数一致
      ⚠️ 原文写"近 7 天…应 ≥12"，把两件事混了：`newStars` 用的是**本周**窗口，不是滚动 7 天。
      按骨架的 UTC 周窗口，2026-10-01 这天实际只有 **10** 条（本地 UTC+8 是 11 条，滚动 7 天才是 19 条）。
      按原文的 ≥12 去验会误判失败。**以"窗口一致"为准，不要卡数字。**
- [ ] 空仓库列表时 `generate()` 不抛错，返回结构完整（7 个 0）
- [ ] `similar()` 第二次调用命中缓存，主进程无网络日志
- [ ] `similar()` 对没有 token 的情况返回 `[]` 而不是崩溃
      ⚠️ 骨架现状是直接 `throw new Error('NOT_IMPLEMENTED: recommend.similar')`，这条要你实现完才成立
- [ ] `tracker.start()` 调两次只启动一个任务（日志只有一行"已启动"）
- [ ] `tracker.stop()` 调两次不报错
- [ ] `tracker.stop()` 之后确实不再触发 tick（等一个周期或改短表达式验证）
- [ ] store 里确实写入了 `latest_release`（非 null）
      ⚠️ 这条要等 C4 的 tick 写出来、并且真的被跑过一次才成立。骨架的 mock 任务体只打日志、
      从不写 latest_release，所以现在必然是 null。
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

