// 端到端自检专用的一次性 Electron 用户数据目录。
//
// 为什么必须隔离：这些自检是拿**真实 Electron** 跑**完整应用**的，而应用把
// starflow.db.json 写在 `app.getPath('userData')` 下——默认就是开发者自己那份真实数据。
// 后果有两层，第二层比第一层严重得多：
//
//   1. 自检不可重复。e2e 自己会 `saveToken("test-token-123")` 并且不清理，跑完那条
//      就留在库里，于是下一次「初始 hasToken 应为 false」必然失败。实测连跑两次，
//      第二次就红。这种「红绿取决于跑了几次」的用例比没有用例更糟——它会训练人忽略红色。
//
//   2. 自检会**改开发者的真实数据**：`saveToken` 直接把你自己的 GitHub token 覆盖成
//      测试串，`updateLocalState` 也会往真实仓库记录里写 `/tmp/e2e`、`me/e2e`。
//      只是"跑一下自检"就把用户的登录态弄没了，这个代价完全不该有。
//
// 隔离之后上面两条一起消失：db 从空开始，跑完删掉，既不重复也碰不到你的数据。
//
// ⚠️ Linux 上 safeStorage 走的是系统 keyring（密文存在 db 里、密钥在 keyring），
// 所以隔离 profile 隔离的是 db 文件；keyring 里已有的密文不受影响，但 db 里没有
// 对应记录，`token` 读出来就是空——这正是自检要的初始状态。
import { rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 返回一个**刚刚清空**的 user-data-dir 的启动参数，直接塞进 Electron 的 argv 即可。
 * 目录本身由 Electron 自己创建，不需要先 mkdir。
 */
export function freshProfileFlag(name) {
  const dir = join(process.cwd(), 'out', 'selfcheck', 'profiles', name)
  rmSync(dir, { recursive: true, force: true })
  return `--user-data-dir=${dir}`
}
