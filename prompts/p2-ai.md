# P2 · ai.ts —— 你的完整工作包

> **你是 P2。这一份文件就是你全部需要的资料。**
> 前置条件：Wave 0 骨架已合入 `main`（PR #2），CI 全绿，`MOCK_MODE=true npm run dev` 能跑通「列表 → 筛选 → unstar → 周报」。
> **干净克隆后第一次跑之前，先执行 `npx install-electron --no`。** `electron@44.5.1` 的 package.json 里没有
> `scripts` 字段，所以它没有 postinstall 钩子，`npm install` / `npm ci` 都**不会**下载 Electron 二进制，
> 直接 `npm run dev` 会报 `Electron failed to install correctly`。这是必然的，不是网络问题。
> 有问题在 GitHub issue #2 里问，不要私聊等回复。

---

## 1. 一句话任务

实现 AI 摘要、7 分类、批量补全（p-limit 并发 3）和周报文案。分类必须收敛到固定枚举，任何失败都要降级而不是让页面崩。

## 2. 你的地盘

| 项目 | 内容 |
|---|---|
| **可以修改/新建** | `src/main/ai.ts`（唯一可改） |
| **绝对不能改** | 其他一切文件，特别是 `src/main/index.ts`、`src/shared/**`、`src/main/mock.ts`、`docs/**` |
| **分支名** | `feat/ai-你的名字` |
| **动手前必读** | `src/shared/types.ts`（重点看 `AiCategory` 和 `AI_CATEGORIES`）、`docs/module-signatures.md`、`src/main/ai.ts`（现有骨架版）、`src/main/mock.ts` |
| **预估工时** | 2 小时 |

> ⚠️ 两个硬约束：**不要用 `response_format: { type: 'json_object' }`**（很多 OpenAI 中转不支持，会直接 400）；**并发必须严格是 3**（`pLimit(3)`，不要裸 `Promise.all`）。

> 发现别人模块有 bug：issue 里 @ 他本人，**不要顺手改**。你改了他的文件，他会 PR 冲突，
> 你也可能覆盖他还没提交的工作。

## 3. 给 AI 的提示词（整块复制）

把下面这一整块复制给 AI，**同时把这些文件的全文贴在提示词后面**（AI 看不到你的仓库）：

- `src/shared/types.ts` 全文
- `src/shared/ipc.ts` 全文
- `docs/module-signatures.md` 全文
- `src/main/ai.ts` 当前的骨架版全文

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

请实现 src/main/ai.ts 的真实逻辑。这个模块负责 AI 摘要、分类、批量补全和周报文案。

【依赖】
- import OpenAI from 'openai'
- import pLimit from 'p-limit'          （v3 写法，默认导入，不要写成 { default as pLimit }）
- import { isMockMode, getEnv } from './config'
- import { AI_CATEGORIES } from '@shared/types'
- import type { Repo, AiCategory } from '@shared/types'
- import * as store from './store'
- import * as github from './github'

【客户端】
模块级懒加载，不要在文件顶层 new：
    let cached: OpenAI | null = null
    let cachedKey = ''
    function client(): OpenAI {
      const env = getEnv()
      if (!env.openaiKey) throw new Error('未配置 OPENAI_API_KEY，请在 .env 中填写')
      if (!cached || cachedKey !== env.openaiKey) {
        cachedKey = env.openaiKey
        cached = new OpenAI({
          apiKey: env.openaiKey,
          baseURL: env.openaiBaseUrl || undefined,
          timeout: 30000,
          maxRetries: 2
        })
      }
      return cached
    }
    function modelName(): string {
      return getEnv().modelName || 'gpt-4o-mini'
    }

【⚠️ 重要约束：不要用 response_format】
不要传 response_format: { type: 'json_object' }。很多 OpenAI 兼容中转 base_url 不支持，
会导致整个调用直接 400。一律采用「提示词里要求输出 JSON + 本地清洗解析」。

【统一降级策略】
summarize / classify / generateReport 在调用失败时都要降级，不要抛错——AI 失败不能把首页搞崩。
**唯一例外**：如果错误信息里包含 '未配置 OPENAI_API_KEY'，要原样 throw 出去，
这样用户能看到明确提示，而不是看到一堆空摘要却不知道为什么。

【1】summarize(readme: string): Promise<string>
- readme 为空、或 trim 后长度小于 30 时，直接返回 ''（不要浪费额度）
- 送模型前截断到前 6000 字符
- messages:
    system: '你是技术文档摘要助手，只输出摘要本身。'
    user: `请用一句中文总结下面这个开源项目的用途和亮点。要求：
           1) 不超过 50 字
           2) 不要以"这个项目"开头
           3) 不要 markdown、不要换行、不要引号
           4) 直接输出摘要，不要任何前缀
           ---
           ${readme}`
- temperature 0.2，max_tokens 200
- 取 choices[0].message.content，trim 后返回
- 失败时 console.error 并返回 ''
- 日志打印耗时：'[ai] summarize 完成，耗时 Nms'

【2】classify(repo: Repo): Promise<AiCategory>
- 提示词把仓库信息给全：
    `请判断下面这个 GitHub 仓库属于哪个分类。只能从以下 7 个词中选择**一个**，不要输出任何其它内容：
     AI/ML、前端、后端、DevOps、工具、学习资源、其他

     仓库全名：${repo.full_name}
     描述：${repo.description ?? '（无）'}
     主要语言：${repo.language ?? '（未知）'}
     主题标签：${repo.topics.join(', ') || '（无）'}
     只回复那一个词。`
- temperature 0，max_tokens 20
- 拿到结果后**必须校验并收敛**（这是本函数的关键，绝不能返回枚举外的值）：
    function normalizeCategory(text: string): AiCategory {
      const t = text.trim()
      if ((AI_CATEGORIES as readonly string[]).includes(t)) return t as AiCategory
      const cleaned = t.replace(/[\s"'`。.,，、]/g, '')
      const hit = AI_CATEGORIES.find((c) => cleaned.includes(c))
      return hit ?? '其他'
    }
- 失败时返回 '其他'（除非是缺少 API Key，那就 throw）
- 日志：'[ai] classify <fullName> -> <分类>'

【3】generateReport(repos: Repo[]): Promise<string>
- repos 为空时返回 '本周没有新增 Star。'（不要调用模型）
- 把仓库整理成紧凑文本，最多 50 条，每条形如：
    `react (JavaScript, 前端, 210000 stars)`
- 提示词：
    `请根据下面的本周新增 Star 列表，写一段中文周报总结。
     要求：
     1) 100~200 字
     2) 语气自然口语，像人在群里汇报工作，不要"综上所述""总而言之"这种套话
     3) 提到本周新增数量、主力语言、以及最值得关注的 1~2 个项目
     4) 不要 markdown、不要分点、不要换行
     5) 直接输出这段话
     ---
     ${list}`
- temperature 0.6，max_tokens 500
- 失败时降级为本地拼接的兜底文案（统计语言分布，取最多的那个）：
    `本周新增 ${repos.length} 个 Star，主力语言是 ${topLang}，其中 ${topRepo.full_name} 最值得一看。`
- 这个函数被 src/main/report.ts 调用，必须稳定不抛错

【4】enrichRepos(repos: Repo[]): Promise<Repo[]>
这是**设置页**「AI 补全分类」按钮背后的核心逻辑，也是本 issue 唯一涉及并发的函数。
（⚠️ 那个按钮在 `pages/Settings.tsx`，不在首页 Dashboard——别去 Dashboard 找。）

- **必须**用 p-limit 限制并发为 3：
    const limit = pLimit(3)
    let done = 0
    const tasks = repos.map((r) =>
      limit(async () => {
        const result = await enrichOne(r)
        done += 1
        if (done % 5 === 0 || done === repos.length) {
          console.log(`[ai] 已补全 ${done}/${repos.length}`)
        }
        return result
      })
    )
    const enriched = await Promise.all(tasks)
- enrichOne(repo) 的逻辑：
    1. 如果 repo.ai_category 和 repo.ai_summary 都已有值 → 直接原样返回（跳过，省额度）
    2. category = await classify(repo)
    3. summary = repo.ai_summary ?? ''
       如果 summary 为空，尝试：
         try {
           const readme = await github.fetchReadme(repo.full_name)
           if (readme.trim().length >= 30) summary = await summarize(readme)
         } catch (err) {
           console.error(`[ai] 读取 README 失败，跳过摘要：${repo.full_name}`, err)
         }
    4. 返回 { ...repo, ai_category: category, ai_summary: summary || undefined }
- 全部跑完后**写回存储**：await store.saveRepos(enriched)
- 返回 enriched
- ⚠️ 绝对不要用裸的 Promise.all(repos.map(...)) 直接并发全部仓库——mock 数据有 31 个仓库，
  同时打 LLM 会瞬间触发速率限制，而且演示时整页卡住

【严禁】
- 不要用 response_format
- 不要在 summarize / classify / generateReport 里 throw（除了缺 API Key）
- 不要修改 src/main/index.ts、mock.ts、config.ts、shared/**、docs/**
- 不要新增依赖
- 不要自己实现一个并发池，就用 p-limit

需要集成工程师确认的事项，在最后单列。
```

## 4. 完成后必做

```bash
npx install-electron --no   # 干净克隆后第一次必跑，否则 npm run dev 起不来（见开头前置条件）

npm run typecheck && npm run lint

# 分类枚举收敛性自查（不联网，纯逻辑）：确认 normalizeCategory 对脏输入只会返回 7 个枚举值
# 在临时脚本或 Node REPL 里验一遍这些输入（右边是"至少要做到"的底线，更聪明当然更好）：
#   'AI/ML' → 'AI/ML'       '前端。' → '前端'        '前端开发' → '前端'
#   'DevOps' → 'DevOps'     'Devops' → 按你的归一化规则处理，但**必须落在这 7 个枚举内**
#                          （落到 '其他' 也算合格——原文这句写得含混，别按字面理解成"必须命中 DevOps"）
#   '这是一个前端项目' → '前端'     '随便什么' → '其他'
# 底线只有一条：**任何输入都不许返回 7 个枚举之外的值**。

# 真实模式冒烟（.env 里填好 OPENAI_API_KEY / OPENAI_BASE_URL / MODEL_NAME，MOCK_MODE=false）
npm run dev
#   → **设置页**点「AI 补全分类」，观察主进程控制台应打印
#     [ai] 已补全 5/31、10/31 ... 且过程中界面不卡死
```

```bash
git add -A && git commit -m "feat(ai): 实现摘要、分类、批量补全与周报文案生成"
git push origin feat/ai-你的名字
```

## 5. DoD 清单

- [ ] 用 mock 的 **31** 条数据跑一遍 `classify`，输出分布**全部落在 7 个枚举内**（打印分布贴到 PR 里）
      （mock-data.json 现有 31 条；分类分布约为 AI/ML 6、工具 6、前端 5、后端 4、DevOps 4、学习资源 4、其他 2）
- [ ] 构造脏输出（让模型返回 `这是前端类的项目`、`【工具】`、``` ```json ... ``` ```）→ 都能收敛到合法枚举
- [ ] `enrichRepos` 的并发**严格 ≤3**（在 enrichOne 里临时打时间戳，确认同时在飞的请求不超过 3 个）
- [ ] `enrichRepos` 跑完 31 条后，`starpilot.db.json` 里确实写入了 `ai_category` 和 `ai_summary`
      （MOCK_MODE=true 时文件叫 `starpilot.mock.db.json`）
- [ ] 重复点两次「AI 补全分类」→ 第二次因为已有值而快速跳过（日志能看出来）
      ⚠️ 骨架里的 `mockEnrich` **没有**跳过逻辑，每次都重算。这条要等你实现完 enrichOne 第 1 步才成立；
      而且跳过判断必须写在 mock 分支**之外**，否则 `MOCK_MODE=true` 的可见行为就变了。
- [ ] 故意把 `OPENAI_API_KEY` 清空 → 前端看到「未配置 OPENAI_API_KEY」的中文提示，而不是白屏
      ⚠️ 这句提示**现在还不存在**，需要你在 ai.ts 里 throw 出来；它会经 index.ts 的包装器变成
      `{ ok:false, error }`，再由 `lib/api.ts` 的 `unwrap` 弹成 toast。别指望界面里有现成文案。
- [ ] 故意把 `OPENAI_BASE_URL` 填错 → 首页仍能正常浏览（摘要降级为空，不崩）
- [ ] `MOCK_MODE=true` 时行为与骨架版完全一致
- [ ] `npm run build` 也过（`@shared/*` 别名在 tsc 的 `paths` 和 electron.vite.config.ts 里是两套配置，
      typecheck 过了不代表打包也过）
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

