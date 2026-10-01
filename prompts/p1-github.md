# P1 · github.ts —— 你的完整工作包

> **你是 P1。这一份文件就是你全部需要的资料。**
> 前置条件：Wave 0 骨架已合入 `main`（PR #2），CI 全绿，`MOCK_MODE=true npm run dev` 能跑通「列表 → 筛选 → unstar → 周报」。
> **干净克隆后第一次跑之前，先执行 `npx install-electron --no`。** `electron@44.5.1` 的 package.json 里没有
> `scripts` 字段，所以它没有 postinstall 钩子，`npm install` / `npm ci` 都**不会**下载 Electron 二进制，
> 直接 `npm run dev` 会报 `Electron failed to install correctly`。这是必然的，不是网络问题。
> 有问题在 GitHub issue #1 里问，不要私聊等回复。

---

## 1. 一句话任务

把 GitHub 侧的数据读写全部实现出来：Star 列表拉取（含分页）、README、Release、Commit，以及 unstar / fork 两个写操作。这是整个应用的数据源头，也是主进程最重的一块。

## 2. 你的地盘

| 项目 | 内容 |
|---|---|
| **可以修改/新建** | `src/main/github.ts`（唯一可改） |
| **绝对不能改** | 其他一切文件，特别是 `src/main/index.ts`、`src/shared/**`、`src/main/mock.ts`、`docs/**` |
| **分支名** | `feat/github-你的名字` |
| **动手前必读** | `src/shared/types.ts`、`src/shared/ipc.ts`、`docs/module-signatures.md`、`src/main/github.ts`（现有骨架版）、`src/main/mock.ts` |
| **预估工时** | 2~3 小时 |

> ⚠️ 本模块最容易犯的错：在 `unstar` 里顺手删 store。**不要**——从本地列表移除是 `index.ts` 里 handler 的职责，你删了就是双重删除 + 竞态。

> 发现别人模块有 bug：issue 里 @ 他本人，**不要顺手改**。你改了他的文件，他会 PR 冲突，
> 你也可能覆盖他还没提交的工作。

## 3. 给 AI 的提示词（整块复制）

把下面这一整块复制给 AI，**同时把这些文件的全文贴在提示词后面**（AI 看不到你的仓库）：

- `src/shared/types.ts` 全文
- `src/shared/ipc.ts` 全文
- `docs/module-signatures.md` 全文
- `src/main/github.ts` 当前的骨架版全文

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

请实现 src/main/github.ts 的真实逻辑。这是本项目最核心的数据层。

【依赖与初始化】
- import { Octokit } from 'octokit'
- import * as store from './store'
- import { isMockMode } from './config'
- import type { Repo, Release, Commit } from '@shared/types'
- 用模块级变量缓存 Octokit 实例和它对应的 token：
    let cachedToken: string | null = null
    let cachedOctokit: Octokit | null = null
    async function client(): Promise<Octokit> {
      const token = await store.getToken()
      if (!token) throw new Error('未配置 GitHub Token，请到设置页填入后重试')
      if (!cachedOctokit || cachedToken !== token) {
        cachedToken = token
        cachedOctokit = new Octokit({ auth: token })
      }
      return cachedOctokit
    }
- 每个公开函数第一行仍然是 if (isMockMode()) return mockXxx(...)，第二行起才是真实实现

【工具函数】
function splitFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) throw new Error(`仓库全名格式不对：${fullName}（应为 owner/repo）`)
  return { owner, repo }
}

function toReadableError(err: unknown, action: string): Error {
  const status = (err as { status?: number }).status
  const message = err instanceof Error ? err.message : String(err)
  if (status === 401) return new Error('GitHub Token 无效或已过期，请在设置页重新配置')
  if (status === 403) return new Error('权限不足或速率受限：请确认 Token 勾选了 public_repo scope，且未超出 API 限额')
  if (status === 404) return new Error(`仓库不存在或无权访问：${action}`)
  if (status === 409) return new Error('仓库为空，没有可用的提交记录')
  if (status === 429) return new Error('请求过于频繁，请稍后再试')
  return new Error(`${action} 失败：${message}`)
}

【1】fetchStarred(): Promise<Repo[]>
- 用 octokit.rest.activity.listReposStarredByUser({ per_page: 100, page, mediaType: { format: 'star+json' } })
- ⚠️ 这是最容易写错的地方：带 star+json 时，返回数组的每一项结构是 { starred_at, repo }，
  而不是仓库对象本身。必须写成防御式兼容，两种结构都要能处理：
    for (const raw of items as any[]) {
      const r = raw.repo ?? raw
      const starredAt = raw.starred_at ?? r.pushed_at ?? new Date().toISOString()
      ...
    }
  ⚠️ 这里的 `as any[]` 是**整个文件唯一被豁免的 any**（见铁律第 7 条）：star+json 下 GitHub 返回的是
  `{ starred_at, repo }` 联合结构，@types 给不出准确类型。除此之外不要再出现任何 any。
- 分页：最多 3 页（每页 100，即最多 300 条）。当前页返回数量小于 100 就停止；到第 3 页也停止。
  每页之间不要 sleep。
- 映射成 Repo，字段严格对应 types.ts：
    id: r.id
    full_name: r.full_name
    description: r.description ?? null
    language: r.language ?? null
    stargazers_count: r.stargazers_count ?? 0
    html_url: r.html_url
    starred_at: starredAt（保证是 ISO 8601 字符串）
    topics: Array.isArray(r.topics) ? r.topics : []
    pushed_at: r.pushed_at ?? null
    latest_release: null        ← 固定 null，由 tracker 负责填充
  不要设置 ai_summary / ai_category / local —— 这些字段的既有值由调用方保留，你不要碰。
- 返回值按 starred_at 倒序（最新 star 的在最前）
- 日志：'[github] fetchStarred 完成，共 N 条（M 页）'
- ⚠️ 不要在这个函数里调用 fetchReleases 或任何 AI 接口，否则首页加载会极慢

【2】fetchReadme(fullName: string): Promise<string>
- 用 octokit.rest.repos.getReadme({ owner, repo })
- data.content 是 base64，用 Buffer.from(data.content, 'base64').toString('utf8') 解码
- 仓库没有 README（404）时**不要抛错**，返回空字符串 ''
- 内容超过 200000 字符时截断（防止极端仓库把内存撑爆）
- 其它错误照常 throw toReadableError(err, fullName)

【3】fetchReleases(fullName: string): Promise<Release[]>
- octokit.rest.repos.listReleases({ owner, repo, per_page: 10 })
- 映射：tag_name / name（可为 null）/ published_at / html_url，字段名严格按 types.ts
- 404 或 409 时返回 []
- 只要不是数组就返回 []

【4】fetchCommits(fullName: string): Promise<Commit[]>
- octokit.rest.repos.listCommits({ owner, repo, per_page: 10 })
- 映射：
    sha: item.sha
    message: (item.commit?.message ?? '').split('\n')[0]   ← 只保留第一行
    date: item.commit?.author?.date ?? item.commit?.committer?.date ?? ''
    html_url: item.html_url
- 空仓库（GitHub 返回 409）时返回 []
- 404 时返回 []

【5】unstar(fullName: string): Promise<void>
- octokit.rest.activity.unstarRepoForAuthenticatedUser({ owner, repo })
- 成功返回 204，没有响应体，直接 return
- ⚠️ 这个函数的骨架 mock 分支是**块语句**，不是单行 return：
      if (isMockMode()) { mockUnstar(fullName); return }
  整块保留，一行都别动（骨架里 mockUnstar 是同步的，所以没有 await）。
- ⚠️⚠️ 只做 API 调用！**绝对不要**在这里读写 store 去删除仓库。
  从本地列表移除这件事由 src/main/index.ts 里的 handler 负责（骨架里已经写好了）。
  你如果也删一次，会造成双重删除和竞态，这是本 issue 最容易犯的错。
- 日志：'[github] 已取消 Star: <fullName>'

【6】fork(fullName: string): Promise<Repo>
- octokit.rest.repos.createFork({ owner, repo })
- 返回的是 fork 后的仓库对象，映射成 Repo（字段按 types.ts 填全）：
    starred_at 用 new Date().toISOString()
    latest_release 用 null
    topics 用 data.topics ?? []
    description / language 允许为 null
    stargazers_count 用 data.stargazers_count ?? 0
- GitHub 的 fork 是异步的，接口可能返回一个还在创建中的仓库。不要轮询、不要 sleep、不要等待，
  直接返回即可（前端展示的是"已 Fork"状态和链接，不依赖仓库是否创建完成）
- ⚠️ 不要自动 clone，clone 是独立操作
- 日志：'[github] 已 Fork: <fullName> -> <结果 full_name>'

【补充要求】
- 整个文件不要有 require
- pagination 不要用 octokit 的 paginate 插件（我们只需要 3 页，手写循环更可控）
- 每个网络函数都要包一层 try/catch，catch 里统一 throw toReadableError(err, '<动作描述>')
  但注意：fetchReadme / fetchReleases / fetchCommits 的 404 分支要在 catch 内部先判断再决定
  是 return [] 还是 throw
- 文件顶部**已有的**注释要保留：第一行现在是
  `// 负责人：P1 ｜ 接口规格见 docs/module-signatures.md（冻结），任务说明见 prompts/`
  别删、别改、别重复加一行「负责人：P1」。（原来这里写的 `guide.md` 是失效引用，已经统一改掉了。）

需要集成工程师确认的事项，在最后单列。
```

## 4. 完成后必做

```bash
npx install-electron --no   # 干净克隆后第一次必跑，否则 npm run dev 起不来（见开头前置条件）

npm run typecheck && npm run lint

# Mock 回归：行为必须和骨架版完全一致
MOCK_MODE=true npm run dev
#   → 列表仍有 31 条（mock-data.json 全量），unstar/fork 仍正常

# 真实模式冒烟（需要 .env 里填好真实 GITHUB_TOKEN）
# .env: MOCK_MODE=false
npm run dev
#   → 设置页点「从 GitHub 同步」，再回首页，应能看到真实 Star 列表
#     （⚠️「测试连接」按钮是 P6 工作包里的活，现在还**不存在**，别去找它）
```

```bash
git add -A && git commit -m "feat(github): 实现 Star 拉取、README、Release、Commit、unstar 与 fork"
git push origin feat/github-你的名字
```

## 5. DoD 清单

- [ ] 真实 token 下 `fetchStarred()` 能拉到自己的 Star，字段无 undefined（用浏览器 DevTools 或 `console.log` 抽查 3 条）
- [ ] 分页逻辑正确：Star 数超过 100 时能拉到第 2 页，且不超过 300 条
- [ ] `description` / `language` 为 null 的仓库不报错
- [ ] 故意填一个错的 token → 前端看到「GitHub Token 无效或已过期」而不是英文报错
- [ ] 故意 unstar 一个自己的测试仓库 → GitHub 上确实取消了，且列表里消失了（**只消失一次，不是两次**）
- [ ] `fetchReadme` 对一个没有 README 的仓库返回空字符串，不抛错
- [ ] `MOCK_MODE=true` 时行为与骨架版完全一致（列表 31 条；unstar 后卡片消失且**重启不复活**）
- [ ] `npm run build` 也过（`typecheck` 过了不代表 bundler 也过：`@shared/*` 别名由 electron.vite.config.ts 提供，
      打包路径和 tsc 的 `paths` 是两套配置）
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

