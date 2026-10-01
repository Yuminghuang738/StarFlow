# feat(ai): 实现摘要、分类、批量补全与周报文案生成

> P2 · `src/main/ai.ts`。把骨架里的 4 个 `throw NOT_IMPLEMENTED` 换成真实实现，**mock 分支逐行保留**。

## 改了哪些文件

| 文件 | 说明 |
|---|---|
| `src/main/ai.ts` | 唯一业务文件，4 个导出函数真实实现 |
| `scripts/selfcheck/*` | 新建自检脚手架（仓库原先没有 `scripts/`），**不接入 CI** |

未触碰：`src/shared/**`、`src/main/index.ts`、`config.ts`、`mock.ts`、`docs/**`、`package.json`。

## 签名确认

与 `docs/module-signatures.md` 逐字一致，未改任何导出函数的名称 / 参数 / 返回类型：

```ts
export function summarize(readme: string): Promise<string>
export function classify(repo: Repo): Promise<AiCategory>
export function enrichRepos(repos: Repo[]): Promise<Repo[]>
export function generateReport(repos: Repo[]): Promise<string>
```

## 实现要点

- **不使用 `response_format`**：一律「提示词要求输出 + 本地清洗解析」，避免中转 400。
- **统一降级**：`summarize` 失败→`''`；`classify` 失败→`'其他'`；
  `generateReport` 失败→本地拼接兜底文案（**连缺 Key 也降级**，因为它被 `report.ts` 调用，
  不能让 AI 出问题把周报页搞崩）。
- **唯一例外**：错误信息包含「未配置 OPENAI_API_KEY，请在 .env 中填写」时原样 throw，
  经 `index.ts` 包装成 `{ok:false,error}`，再由 `lib/api.ts#unwrap` 弹 toast。
- `summarize`：空 / trim<30 直接返回 `''`；截断 6000 字符；temp 0.2 / max_tokens 200。
- `classify`：temp 0 / max_tokens 20；`extractContent`（剥 ```` ```json ```` 围栏、抽 `"category":"x"`）
  + `normalizeCategory`（精确匹配 → 清标点/引号 → **大小写折叠** → 兜底 `'其他'`）双层收敛。
- `enrichRepos`：`pLimit(3)` 严格并发；**跳过判断放在 mock 分支之外**；README 读失败只跳过摘要；
  跑完 `store.saveRepos()` 落盘后返回完整列表。
- `generateReport`：空列表短路为 `'本周没有新增 Star。'`；列表最多 50 条，格式
  `full_name (language, category, N stars)`。
- 全程 UTC 口径，未改任何日期处理。

## mock 分支零改动证明

`git diff main..HEAD -- src/main/ai.ts` 中**被删除的行只有 6 行**：

```
-// 真实实现要点（P2 补）：用 openai SDK，key 从 config.getEnv() 取；
-import { isMockMode } from './config'
-  throw new Error('NOT_IMPLEMENTED: ai.summarize')
-  throw new Error('NOT_IMPLEMENTED: ai.classify')
-  throw new Error('NOT_IMPLEMENTED: ai.enrichRepos')
-  throw new Error('NOT_IMPLEMENTED: ai.generateReport')
```

`if (isMockMode()) ...` 四个分支及其内部逻辑一行未动（`classify` 的
`AI_CATEGORIES.includes(result) ? result : '其他'` 兜底也原样保留）。

## 验收结果

### 1. `classify` 跑 31 条 mock 数据，分布全部落在 7 个枚举内

```
总数: 31
分布: {"AI/ML":6,"前端":5,"后端":6,"DevOps":2,"工具":9,"学习资源":2,"其他":1}
```

> 说明：`classify` 直接调 `mockClassify`，分布由 `mock.ts` 的规则决定，与工作包里
> 「AI/ML 6、工具 6、前端 5、后端 4、DevOps 4、学习资源 4、其他 2」的约数有差异。
> `mock.ts` 是 P7 的地盘，我未改动。**底线（全部落在 7 个枚举内）已满足。**

### 2. 脏输出收敛（14 例全 PASS）

```
'AI/ML'                            -> AI/ML
'前端。'                            -> 前端
'前端开发'                          -> 前端
'DevOps'                           -> DevOps
'Devops' / 'devops'                -> DevOps
'这是一个前端项目'                    -> 前端
'随便什么'                          -> 其他
'【工具】'                          -> 工具
'```json {"category": "后端"} ```'   -> 后端
'' / '   '                         -> 其他
'学习资源、其他'                     -> 学习资源
'  后端  '                          -> 后端
```

### 3. `enrichRepos` 并发严格 ≤3（实测）

起一个假的 OpenAI 兼容端点（本地 http server，每条响应延迟 60ms）观测在飞请求数：

```
PASS  输入仓库条数 — 31
PASS  全部返回 — 31
PASS  每条都拿到了分类
PASS  并发峰值 ≤ 3 — 峰值 3
PASS  确实发生了并发（不是串行） — 峰值 3
总请求数 31，耗时 797ms
串行下限约 1860ms，并发 3 的理论值约 620ms
```

### 4. 缺 Key 的中文提示

```
summarize(100字)   : throw -> 未配置 OPENAI_API_KEY，请在 .env 中填写
classify           : throw -> 未配置 OPENAI_API_KEY，请在 .env 中填写
enrichRepos        : throw -> 未配置 OPENAI_API_KEY，请在 .env 中填写
generateReport     : 不抛错 -> "本周新增 1 个 Star，主力语言是 未知，其中 a/b 最值得一看。"
summarize("")      : 不抛错 -> ""
generateReport([]) : 不抛错 -> "本周没有新增 Star。"
```

### 5. 工程质量

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅（main 40.41 kB / preload / renderer 三端全过，验证了
  `electron.vite.config.ts` 那套 `@shared/*` 别名）

## 自检脚手架（可选产物，未接入 CI）

仓库原先没有 `scripts/`，本次新建 `scripts/selfcheck/`：

```bash
# 1) 打桩打包（--packages=external 不能省；产物必须放项目内 out/）
npx esbuild scripts/selfcheck/ai-entry.ts --bundle --platform=node --format=esm \
  --packages=external --outfile=out/selfcheck/ai-bundle.mjs \
  --alias:electron=scripts/selfcheck/electron-stub.mjs

# 2) 跑自检
node scripts/selfcheck/ai.mjs mock           # 收敛性 + 分布 + 空输入
node scripts/selfcheck/ai-concurrency.mjs    # 并发峰值（假 OpenAI 端点）
```

踩到的坑（已写在脚本注释里）：

- `--packages=external` 不能省，否则 dotenv 的 CJS 动态 `require('fs')` 会让 ESM 打包直接失败。
- `MOCK_MODE` 必须在**动态 import 之前**设置 —— ESM 的 import 会被提升，静态 import
  会让 `process.env.MOCK_MODE = 'true'` 失效。
- 产物放项目内 `out/`（已 gitignore），否则裸模块名解析不到。

## 未完成 / 需他人处理

- [ ] **`npx install-electron --no` 未执行**（干净克隆后首次必跑）。本机沙箱网络受限，
      请在本地执行后跑真实模式冒烟。
- [ ] **真实模式冒烟未做**：需要可用的 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL_NAME`，
      填好后 `MOCK_MODE=false npm run dev` → 设置页点「AI 补全分类」→ 主进程控制台应打印
      `[ai] 已补全 5/31、10/31 ...` 且界面不卡死。
- [ ] **删除两个调试残留文件**（沙箱拒绝所有删除操作，未纳入提交）：
      - `src/main/ai.skeleton.backup.ts`
      - `electron.vite.config.1790832961491.mjs`

## 需要集成工程师确认

无。契约字段够用，未新增任何依赖，未新增任何字段。
