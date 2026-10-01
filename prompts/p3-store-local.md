# P3 · store.ts + local.ts —— 你的完整工作包

> **你是 P3。这一份文件就是你全部需要的资料。**
> 前置条件：Wave 0 骨架已合入 `main`（PR #2），CI 全绿，`MOCK_MODE=true npm run dev` 能跑通「列表 → 筛选 → unstar → 周报」。
> **干净克隆后第一次跑之前，先执行 `npx install-electron --no`。** `electron@44.5.1` 的 package.json 里没有
> `scripts` 字段，所以它没有 postinstall 钩子，`npm install` / `npm ci` 都**不会**下载 Electron 二进制，
> 直接 `npm run dev` 会报 `Electron failed to install correctly`。这是必然的，不是网络问题。
> 有问题直接在你收到这份工作包的那个 issue 里问，不要私聊等回复。

---

## 1. 一句话任务

加固本地存储（lowdb + safeStorage 加密 + 状态合并），并实现本地 Git 操作（选目录 / clone / 打开目录）。

## 2. 你的地盘

| 项目 | 内容 |
|---|---|
| **可以修改/新建** | `src/main/store.ts`、`src/main/local.ts`（只有这两个） |
| **绝对不能改** | 其他一切文件，特别是 `src/main/index.ts`、`src/shared/**`、`src/main/mock.ts`、`docs/**` |
| **分支名** | `feat/store-local-你的名字` |
| **动手前必读** | `docs/module-signatures.md` 的 store / local 两节、`src/main/store.ts` 与 `src/main/local.ts` 的骨架全文（这两个文件**都已经能跑**，你是加固不是补空） |
| **预估工时** | 2 小时 |

> ⚠️ `store.ts` 骨架版**已经能用**，不要推倒重写，按提示词里的 A1~A8 逐条加固即可。另外 `shell.openPath()` 永远不会 reject，用 try/catch 抓不到失败，必须检查返回值。

> 发现别人模块有 bug：issue 里 @ 他本人，**不要顺手改**。你改了他的文件，他会 PR 冲突，
> 你也可能覆盖他还没提交的工作。

## 3. 给 AI 的提示词（整块复制）

把下面这一整块复制给 AI，**同时把这些文件的全文贴在提示词后面**（AI 看不到你的仓库）：

- `src/shared/types.ts` 全文
- `src/shared/ipc.ts` 全文
- `docs/module-signatures.md` 全文
- `src/main/store.ts` 与 `src/main/local.ts` 当前的骨架版全文

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

请加固 src/main/store.ts，并实现 src/main/local.ts 的真实逻辑。

═══════════ A. store.ts 加固 ═══════════
⚠️ **先看清现状，别按想象改**：`store.ts` 是骨架里仅有的两个"已经完整实现"的文件之一
（另一个是 `report.ts`）。它里面**没有任何 `isMockMode()` 分支、没有任何
`throw new Error('NOT_IMPLEMENTED: ...')`**——和前面【骨架的既有形态】里说的 (a)(b) 两种形态都不一样。
它是形态 (c)：真实现。所以你的工作是**加固**，不是把 throw 换成实现。

骨架版已经是可用的，**不要推倒重写**，按下面 A1~A8 逐条加固（A8 是可选的加分项）。
必须保持 docs/module-signatures.md 里 getToken / saveToken / hasToken / getRepos /
saveRepos / updateLocalState 这 6 个导出签名完全不变。

【A1】db 文件与初始化   ← 骨架里**已经实现**，核对即可，不要重写
- 用 lowdb@7：import { JSONFilePreset } from 'lowdb/node'
- 文件路径：join(app.getPath('userData'), isMockMode() ? 'starpilot.mock.db.json' : 'starpilot.db.json')
  （骨架把它抽成了独立的 dbFilePath() 函数；类型名是 DbSchema，不是 Data）
- 写盘前用 mkdirSync(dirname(file), { recursive: true }) 确保目录存在
- 默认数据结构：{ repos: [] as Repo[], token: null as string | null }
- 模块级缓存 db 实例：let dbPromise: Promise<Low<DbSchema>> | null = null
  async function getDb() { ... }

【A2】原子写】
lowdb 7 的 JSONFile 适配器内部用 steno 做原子写，**不要**自己写 tmp+rename 那一套。
你只需要保证每次修改后都 await db.write()。

【A3】读缓存
模块级缓存最近一次读到的 repos：let reposCache: Repo[] | null = null
- getRepos()：cache 非空直接返回 structuredClone(cache)；否则读盘、写 cache、返回
- saveRepos(repos)：写盘成功后把 reposCache 更新为 structuredClone(repos)
- updateLocalState 成功后要同步更新 reposCache 里对应的那条
（不要做定时失效，进程内一致性就够）

【A4】Token 加解密    ← ⚠️ 已按 issue #12 重做：结论是方案 (c)，不落盘
- safeStorage.isEncryptionAvailable() 为 true：
    存 safeStorage.encryptString(token).toString('base64')，并把 memoryToken 置 null
- 为 false（Linux 无 keyring 时会走到）：**一个字节都不写盘**
    memoryToken = token            ← 新增模块级变量 let memoryToken: string | null = null
    db.data.token = null           ← 同时把历史上可能残留的 'PLAIN:' 明文从文件里抹掉
    console.warn('[store] 系统未提供加密后端，token 仅保存在内存中，重启后需重新填写')
    两种情况都要 await db.write()；false 分支这次写盘正是本次的迁移路径，不能省
- getToken()：memoryToken 非 null → 直接返回它；否则读 db.data.token：
    · 以 'PLAIN:' 开头 → 去掉前缀返回（**只读不写**，兼容别人机器上遗留的旧数据）
    · 否则 safeStorage.decryptString(Buffer.from(value, 'base64'))
  'PLAIN:' 前缀的**判断要保留**，**写入分支要删掉**
- hasToken()：memoryToken !== null || (await getToken()) !== null
- ⚠️ decryptString 在密钥环变化后会抛错（换机器 / 换用户），必须 try/catch：
  失败时 console.error 并返回 null，**绝不往外抛**
- saveToken 要校验：token 为空或 trim 后为空时抛 new Error('Token 不能为空')，位置在 try 外面

为什么是 (c) 而不是 (a)/(b)：
  (a)（带 'PLAIN:' 前缀的明文）仍然把明文写进了磁盘，契约字面满足不了，前缀也不提供任何保护；
  (b)（抛错）会让无 keyring 的机器上**真实模式完全不可用**。
  ⚠️ 另外纠正一句原来的错误说法：saveToken / getToken **不在启动路径上**——
  调用点是 IPC.STORE_SAVE_TOKEN ← 设置页的保存按钮、IPC.STORE_HAS_TOKEN ← 打开设置页、
  store.getToken() ← github.ts 的 client()，app.whenReady() 一个都不碰。
  抛错的实际后果只是弹一条 toast，应用照常打开（详见 issue #9 里的核实评论）。
  完整规格见 issue #12。

【A5】getRepos 的种子逻辑
读到的列表为空数组、且 isMockMode() 为 true 时，用 mockStarred() 的结果作为种子写入并返回。
（骨架版已实现，确认它在"缓存"改造后仍然生效：注意判断要基于真实读盘结果，不是 cache）

【A6】updateLocalState(fullName, state)   ← ⚠️ 这是**要改的**，不是现状
先说清楚现状，免得你对着代码发懵——骨架当前的行为和下面这两条要求**正好相反**：
  · 现在是 `throw new Error(\`仓库不存在: ${fullName}\`)`，不是 warn
  · 现在是 `{ ...repo.local, ...state }` 直接浅合并，**没有**剔除 undefined
也就是说 p3 的 DoD 里那两条"不抛错 / 不抹掉"现在**必然失败**，那是改完之后才成立的验收线。
- 找不到该仓库时**不要抛错**，console.warn(`[store] updateLocalState 未找到仓库：${fullName}`) 后正常返回
- 合并用 { ...repo.local, ...state }
- ⚠️ state 里值为 undefined 的键要剔除掉，不能把已有的值抹成 undefined：
    const patch = Object.fromEntries(Object.entries(state).filter(([, v]) => v !== undefined))
- 合并后必须 await 写盘，并同步更新 reposCache

【A7】错误处理
所有导出函数都包 try/catch，错误信息用中文且能指导排查，例如：
  '读取本地数据失败：' + message
  '保存本地数据失败：' + message
不要吞掉错误后返回假成功；但 getToken 的 decrypt 失败是上面说的例外（返回 null）。

【A8】可选加分项（**如果集成工程师没在线就跳过，不要卡住自己**）
新增 export function getDbFilePath(): string，返回当前 db 文件的绝对路径。
设置页想显示"数据保存在 xxx"。
⚠️ 这属于契约新增：实现完必须在 issue 里 @集成工程师，让他同步更新 docs/module-signatures.md，
你**不要**自己去改 docs（CI 会拦住）。

═══════════ B. local.ts 实现 ═══════════
同样先看清现状，三个函数的骨架形态**各不相同**：
  · chooseDir / clone：mock 分支是**块语句**——mock 下 chooseDir 会 mkdirSync 并返回下载目录下的
    StarPilotDemo，clone 会 mkdir + 写一个 README.md，然后才 return；throw 在块外面。
    整块保留，只把 throw 换成实现（别改成单行 return，会把演示行为改掉）。
  · openDir：**骨架里已经是真实实现**——existsSync 校验 + shell.openPath + 检查返回值，
    **没有 mock 分支、没有 throw**。它刻意在 MOCK_MODE 下也走真实实现（演示前会预先 clone 好仓库，
    "打开目录"必须真能打开）。所以这里没有 throw 给你替换，你要做的是核对它符合 B3。

【B0】工具函数（**骨架里没有这两个函数**，需要你新增；骨架的 clone mock 分支里内联了等价逻辑）
    function repoNameOf(fullName: string): string {
      const parts = fullName.split('/')
      return parts[1] ?? fullName
    }
    function repoUrlOf(fullName: string): string {
      return `https://github.com/${fullName}.git`
    }

【B1】chooseDir(): Promise<string | null>
- 用 dialog.showOpenDialog
- ⚠️ 必须传 parent window 才会显示为模态对话框：
    const win = BrowserWindow.getAllWindows()[0]
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
- result.canceled 为 true 或 filePaths 为空时返回 null
- 返回 result.filePaths[0]
- 日志：'[local] 用户选择目录：<path>' 或 '[local] 用户取消选择'

【B2】clone(fullName: string, targetDir: string): Promise<string>
- const target = path.join(targetDir, repoNameOf(fullName))
- targetDir 不存在：throw new Error(`所选目录不存在：${targetDir}`)
- target 已存在：throw new Error(`目标目录已存在，请换个目录或先删除：${target}`)
  （不要让 simple-git 去处理，它的报错很难懂）
- 用 simple-git：import { simpleGit } from 'simple-git'
    await simpleGit().clone(repoUrlOf(fullName), target)
- 失败时包装成中文：
    '克隆失败：' + message + '（请确认本机已安装 git 并加入 PATH，且网络可访问 GitHub）'
- 返回 target（完整绝对路径）
- 日志：'[local] 开始克隆 <fullName> -> <target>' 和 '[local] 克隆完成，耗时 Nms'
- ⚠️ 不要用 child_process.exec('git clone ...')，必须走 simple-git

【B3】openDir(path: string): Promise<void>
- 先用 fs.existsSync 判断，不存在：throw new Error(`路径不存在：${path}`)
- 用 shell.openPath(path)
- ⚠️⚠️ shell.openPath 返回的是一个 Promise<string>，成功是**空字符串**，
  失败是错误描述字符串。它**永远不会 reject**，所以 try/catch 是抓不到失败的。
  必须检查返回值：
    const result = await shell.openPath(targetPath)
    if (result) throw new Error(`打开目录失败：${result}`)
- 日志：'[local] 打开目录：<path>'
- ✅ 上面这一整条**骨架里已经实现**，核对即可

【严禁】
- 不要修改 src/main/index.ts、config.ts、mock.ts、shared/**、docs/**
- 不要修改其他模块的文件
- 不要新增 npm 依赖
- 不要删除 mock 分支
- 不要用 require

需要集成工程师确认的事项，在最后单列。
```

## 4. 完成后必做

```bash
npx install-electron --no   # 干净克隆后第一次必跑，否则 npm run dev 起不来（见开头前置条件）

npm run typecheck && npm run lint

# Token 加密自查（MOCK_MODE=true）
MOCK_MODE=true npm run dev
#   → 在设置页填入 test-token-123，然后关掉应用，检查 userData 目录里的
#     starpilot.mock.db.json
#   ⚠️ 现状与提示词不一致，先读这段再判断：
#      骨架在无 keyring 的 Linux 上存的是**裸明文** test-token-123，而且**没有** PLAIN: 前缀。
#      所以这条自查在你按 A4 改完之前**必然失败**，那不是环境问题，是待办项。
#      改完之后应当看到 'PLAIN:test-token-123'；有 keyring 的机器上应当是 base64 密文。

# clone 自查（需要能访问 GitHub）
#   ⚠️ 在 **Dashboard** 点 Clone（设置页没有 Clone 按钮）
#   → 选目录 → 成功后用文件管理器打开该目录，应有完整的 git 仓库（.git 目录存在）
#   → 再点一次 Clone 同一个仓库 → 应看到"目标目录已存在"的中文提示
#     （骨架的 mock 分支用 mkdirSync recursive，不判重，所以这条要等你实现完才成立）
```

```bash
git add -A && git commit -m "feat(store): 加固本地存储与 Token 加密；feat(local): 实现目录选择与 clone"
git push origin feat/store-local-你的名字
```

## 5. DoD 清单

标了「骨架已满足」的几条，你只要确认改动没把它们弄坏；没标的都是**要你实现的**。

- [ ] `saveToken('test-token-123')` 后，db 文件里的 token **不是可直接使用的明文**
      ⚠️ 标准要写清楚：有 keyring 时必须是 base64 密文；无 keyring 时按 A4 的选择，要么是
      `PLAIN:test-token-123`，要么该操作直接抛错。**不允许**是裸的 `test-token-123`。
      （骨架现状就是裸明文——这是你要修的，不是通过项。）
- [ ] `hasToken()` 在保存前后返回 false / true   ← 骨架已满足
- [ ] 换一个假密钥导致 `decryptString` 失败时，应用**仍能正常启动**，`getToken()` 返回 null   ← 骨架已满足
- [ ] `updateLocalState('不存在的仓库', {...})` 不抛错，只 warn   ← ⚠️ 骨架现状是**抛错**，要改
- [ ] `updateLocalState(f, { cloned_path: 'x' })` 后再 `updateLocalState(f, { forked_full_name: 'y' })`，**两个字段都在**   ← 骨架已满足
- [ ] `updateLocalState(f, { cloned_path: undefined })` 不会把已有的 `cloned_path` 抹掉   ← ⚠️ 骨架现状**会**抹掉，要改
- [ ] `MOCK_MODE=true` 首次启动列表自动播种 **31 条**（mock-data.json 全量；缓存改造后种子逻辑仍生效）
- [ ] `chooseDir()` 点取消返回 null，前端不报错
- [ ] `clone` 到一个已存在的目录 → 中文错误提示
- [ ] `clone` 到一个不存在的 targetDir → 中文错误提示
- [ ] `openDir('/不存在的路径')` → 抛「路径不存在」（而不是静默返回）   ← 骨架已满足
- [ ] `openDir` 指向一个真实目录 → 系统文件管理器确实打开   ← 骨架已满足
- [ ] `MOCK_MODE=true` 时 unstar 后重启，被 unstar 的仓库没有复活   ← 骨架已满足
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

