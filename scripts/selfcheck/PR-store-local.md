# chore(selfcheck): 归档 store / local 的自检脚手架

> P3 · `src/main/store.ts` + `src/main/local.ts`。业务改动已随 PR #7 合入 main，
> 本 PR **只补交自检资产**，不改任何业务代码。

## 为什么有这次提交

`prompts/p3-store-local.md` 第 327 行写明自检脚本应放在 `scripts/selfcheck/<模块>.mjs`。
P3 的自检当时落在了 `out/`（已被 .gitignore 忽略），等于这份资产没有交付。
这里按 P1 已经建立的模式（`ai.mjs` + `ai-entry.ts` + 共享 `electron-stub.mjs` + `PR-ai-p2.md`）
补齐到同一位置。

## 改了哪些文件

| 文件 | 说明 |
|---|---|
| `scripts/selfcheck/store-local.mjs` | 新增。统一驱动器：esbuild 打包 + 按场景起子进程；stub 模式每个场景后再起一个**跨进程复查**进程 |
| `scripts/selfcheck/store-local-entry.ts` | 新增。打桩自检（A1~A7 / B0~B3），25 项断言 |
| `scripts/selfcheck/store-local-token-restart.ts` | 新增。跨进程 token 断言（2 项）：换一个进程、复用同一数据目录再查一次 token |
| `scripts/selfcheck/store-local-real-entry.ts` | 新增。真机自检：真实 Electron + 真实 safeStorage |
| `scripts/selfcheck/store-local-clone.ts` | 新增。`clone` / `openDir` 的真实分支（联网） |
| `scripts/selfcheck/store-local-e2e.mjs` | 新增。端到端：构建产物 + CDP 驱动渲染进程（mock） |
| `scripts/selfcheck/store-local-e2e-realclone.mjs` | 新增。端到端 + 真实 clone |
| `scripts/selfcheck/electron-stub.mjs` | **修改**。升级为超集（见下） |
| `scripts/selfcheck/PR-store-local.md` | 新增。本文档 |

未触碰：`src/**`、`docs/**`、`package.json`、`.github/**`、`mock-data.json`。

## 关于 electron-stub.mjs 的改动（向后兼容）

原桩只覆盖 `app.getPath` / `safeStorage` / `shell.openPath`（当初为 ai.ts 而写）。
本次扩成超集：新增 `BrowserWindow` / `dialog`，`shell.openPath` 按**返回值**语义实现，
`safeStorage` 支持用 `SAFESTORAGE_MODE` / `SAFESTORAGE_KEY` 模拟「无 keyring / 换机器」，
`RUN_ID` 可以指定可复现的数据目录（不设则仍是一次性临时目录）。

**默认行为刻意保持不变**：不设任何环境变量时 `safeStorage.isEncryptionAvailable() === false`。

已回归验证 P1 的自检没有被破坏：

```bash
npx esbuild scripts/selfcheck/ai-entry.ts --bundle --platform=node --format=esm \
  --packages=external --outfile=out/selfcheck/ai-bundle.mjs \
  --alias:electron=scripts/selfcheck/electron-stub.mjs
node scripts/selfcheck/ai.mjs mock     # → 全部通过
```

## 用法

```bash
node scripts/selfcheck/store-local.mjs              # 打桩自检（无 keyring / 有 keyring；每个场景后自动跨进程复查）
node scripts/selfcheck/store-local.mjs real         # 真机：真实 Electron + 真实 safeStorage
node scripts/selfcheck/store-local.mjs clone        # 真实 clone（需能访问 github.com）
node scripts/selfcheck/store-local.mjs e2e          # 端到端（需先 npm run build）
node scripts/selfcheck/store-local.mjs e2e-clone    # 端到端 + 真实 clone
```

产物统一放 `out/selfcheck/`（已 gitignore）。**不接入 CI**。

> ⚠️ **合并顺序**：stub 自检里的 token 断言按 issue #9 的决议 **(c)** 编写
> ——「加密后端不可用时 token 只留内存、一个字节都不写盘」。
> 若 `src/main/store.ts` 还是旧结论 (a)（明文 + `PLAIN:` 前缀落盘），这些断言会红 3 条；
> 需 **#12（store.ts 改造）先落地**，本 PR 才是绿的、才能作为 (c) 的验收资产。
> 两者都只动 `scripts/`（#12 动 `src/main/store.ts`），互不阻塞评审。

## 验收结果（本机实测全绿）

| 模式 | 覆盖 | 结果 |
|---|---|---|
| `stub`（无 keyring） | A1~A7 / B0~B3 + 跨进程复查 | 25 + 2 = **27 项 PASS** |
| `stub`（有 keyring） | 同上 | 26 + 2 = **28 项 PASS** |
| `real` | 真实 Electron 44.5.1 + 真实 DPAPI | 9 项 PASS |
| `clone` | 真实 git clone | 6 项 PASS |
| `e2e` | 构建产物 + CDP + 完整 IPC | 11 项 PASS |
| `e2e-clone` | 以上 + 真实 clone | 7 项 PASS |

关键实证：

- **落盘 token（方案 (c)）**：
  - 有 keyring → 落盘为 base64 密文（真实机器上是 60 字符 DPAPI 密文，可解回原文）；
  - 无 keyring → **不写盘**：`starpilot.mock.db.json` 里 grep 不到 token，也 grep 不到 `PLAIN:`；
    同进程内 `getToken()` 仍返回原文，**重启进程后为 `null`、`hasToken()` 为 `false`**。
- **跨进程断言**：驱动器复用同一 `RUN_ID`（同一库文件）起第二个进程复查——
  无 keyring → `null` / `false`；有 keyring → 原样解回 `test-token-123` / `true`。
  这是 (c) 与 (a) 唯一真正可观测的区别，**同进程内查不出来**。
- **播种** 31 条；二次读取返回副本（非同一引用）；unstar 后不复活且缓存同步
- **`updateLocalState`**：找不到仓库只 warn 不抛；两字段都在；传 `undefined` 不抹已有值；缓存与磁盘一致
- **`clone`**：真实克隆成功返回完整绝对路径（约 3.9s，`.git` 与工作区文件均检出）；
  重复克隆 → 「目标目录已存在」；父目录不存在 → 「所选目录不存在」
- **`chooseDir`**：取消 → `null`；选中 → 原样返回；且 dialog 确实收到了 parent window（模态）
- **`openDir`** 核对的是 `shell.openPath` 的**返回值**（它不 reject）

## 踩到的坑（都写进脚本注释了）

1. **`GIT_CONFIG_*` 对 `simple-git` 无效**：simple-git 出于安全会剥掉子进程里**所有**
   `GIT_` 前缀的环境变量 —— 在 bash 里手跑 `git clone` 有效的参数，在应用里必然无效。
   改为让 git 读一份临时 global config（`HOME` → `out/selfcheck/fakehome`），不动真实的 `~/.gitconfig`。
2. **删掉的环境变量会被合并回来**：驱动器最初写 `env: { ...process.env, ...env }`，
   调用方 `delete env.ELECTRON_RUN_AS_NODE` 会被 `process.env` 里的原值覆盖回去 —— 删了等于没删。
   现在 `env` 是完整对象，不再二次合并。
3. **真机自检不能打桩**：`bundle()` 原先前把 `electron` 无条件 alias 到桩，
   于是「真实 Electron」里跑的还是那个只有 `getPath` 的假 `app`（`app.setPath is not a function`）。
   现在 `real` 模式走 `{ stubElectron: false }`。
4. **Electron 在受限沙箱里跑完不退出**：`app.exit()` / `process.exit()` 都拦不住
   （自检已全过、日志也打完了，进程就是不收尾）。真机模式因此改为按**输出里的成功标记**判定，
   拿到结论就结束子进程；其余模式仍用退出码。
5. `--packages=external` 不能省（CJS 动态 `require` 会让 ESM 打包直接失败）；
   `MOCK_MODE` 必须在进程启动前设好（ESM 的 import 提升会让运行时的 `process.env` 赋值失效）。

## 未完成 / 需他人处理

- [ ] **拦截式 TLS 网络环境需要 git 配置**，否则界面点 Clone 会失败：
      `git config --global http.sslBackend schannel` + `http.schannelCheckRevoke false`。
      这是环境前置条件，不是代码问题；自检脚本已用临时 config 绕开，不影响演示机之外的人。
- [ ] `store-local.mjs real` 在本机沙箱里靠输出标记判定（见坑 4）；正常机器上走退出码。

## 需要集成工程师确认

无。本 PR 只动 `scripts/`（不在 `protect-contracts` 的保护名单内），
不改契约、不改依赖、不改 `docs/`。
