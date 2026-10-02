# NIGHT_STATE

phase: autonomous
start_epoch: 1790871552
total_budget_seconds: 28800
deadline_epoch: 1790899952

branch: night/auto-optimize-20261002-0019
base: feat/ai-endpoint-agnostic（PR #31）——**该 PR 已于本轮期间合并进 main**，
      所以本分支现在相对 origin/main 是干净的一批夜间提交（见「已知的收尾事项」）

tasks:
- T1: done      # 栏目命名统一化（83c28bb）
- T2: done      # 收藏总览：30+ 项统计（235965d）+ AI 收藏画像（48a93bb）
- T3: done      # 收藏管理：GitHub 式横条 + AI 一句话解释（1450403）
- T4: done      # 为你推荐：按整份收藏动态推送（7dfdb62）
- T5: done      # 每周回顾：Release 变动进 AI 总结 + 本周项目动态（e07d941）
- T6: done      # 整体布局与视觉现代化（1bd4817 / 51a53bb / 59d4c4e / e974ce2）
- T7: done      # 动效：板块切换 + 列表逐行 + 按钮按压 + reduced-motion（40302fc）

## Phase 2 待办（autonomous 阶段，按提示词的优先级顺序）
- [x] 全量自检摸底：15 个驱动器，14 绿；唯一红的 realclone 是 fixture 写死
      Windows 的 schannel 导致（非功能问题），已按平台分叉修掉（ea7b36e）→ 优先级 1 收口
- [x] 优先级 0：收藏列表排序（160ac5d，含把筛选/排序纯函数抽到 lib/repoQuery.ts）
- [x] 优先级 1：e2e 自检隔离 userData（6d1bd61）——原来自检会覆盖开发者真实 token，
      且 mock e2e 同一 profile 连跑第二次必红
- [x] 优先级 0：筛选补齐活跃度 / 未知语言两档（2eb0c50），并把活跃度判定收成
      collectionStats 的 activityBucket 单一来源，卡片数字与筛出条数由断言锁死
- [x] 优先级 0（继续）：总览统计卡可点击下钻到管理页并带上下面对应的筛选（4d61cfb）
      —— 新增 NavContext（只暴露 goTo，页面仍不收 props、保活结构不变）；
      drill 走 lib 的 filtersFor 整份替换筛选器，避免"卡片 12、点进去 3 条"
- [x] 优先级 0（继续）：分类筛选补上「未分类」态（f2d008f）——category 改成
      'all' | 'uncategorized' | AiCategory 三态，总览的「未分类」那一行与 hero 里
      那句「还有 N 个未分类」都能下钻；判据与 collectionStats 的 categorized 同源
- [x] 优先级 1：e2e 那条偶发断言（ad230d1）——**已定位并修掉**：不是 undefined 过滤、
      也不是 IPC 时序不巧，而是 fixture 写了 `/tmp/e2e` 这个不存在的路径，
      撞上应用启动时的 clone 对账（父目录在、自己不在 → 判为过期记录清掉）。
      改成 mkdtempSync 建的真实目录，断言一字未改；另补两条断言把对账行为钉住
- [ ] 优先级 2：类型 / lint（当前干净，需持续复查）
- [ ] 优先级 3：性能热点（**必须有实测证据**；echarts 按需引入已排除——渲染进程无
      DOM 测试环境，漏注册组件只在运行时炸，不可验证）
- [x] 优先级 5（边界条件）：语言下拉候选项必须包含当前选中项（6a94cc7）——
      从 repos 现推候选 + 独立保存的筛选态，重同步后会凑出"选中的语言已不在收藏里"，
      原生 select 找不到匹配项就渲染成空白，而筛选还在生效
- [x] 优先级 0（候选）：把「本周新增」也接上下钻（fd2f412）——collectionStats 新增
      starredBucket（与 activityBucket 同构，阈值只在一处），repoQuery 加 onlyRecent
      一维，FilterBar 多一个开关，天数从 RECENT_WINDOW_DAYS 拼出来
- [x] 优先级 6（顺手）：活跃度的天数只有一处（f5a7313）——ACTIVE_WINDOW_DAYS /
      STALE_WINDOW_DAYS 导出，总览卡片提示、筛选下拉文案、AI 摘要三处从常量拼；
      文案里不再出现「一年」这类需要读者换算的说法
- [x] 优先级 6（顺手）：趋势图分桶抽成 starTrendBuckets（1d99138）——桶数与标题
      跟 RECENT_WINDOW_DAYS 走，且「图上加起来 == 卡片上的数」现在能断言了
- [x] 优先级 5 + 6：**只读排错 agent 的一批缺陷（R23–R25，81564e3 / d72df77 /
      ce68307）**——起了一个只读 agent 专门找组件层「页面在安静地说谎」，报回 7 条，
      采纳 5 条：Button 的 disabled 被 `{...rest}` 盖掉（loading 时按钮仍可点）、
      设置页的同步与 AI 补全能同时跑（后者用旧列表覆盖刚同步的结果并落盘）、
      周报「本周新版本」把查询失败显示成 0、周报两张卡/图共用了「本周」却不同窗、
      ConfirmDialog 没有焦点管理与焦点陷阱（键盘够不着）、RepoExplain 的初始文本
      只在挂载时取一次（补全完仍显示空）。未采纳 2 条已记入 OPTIMIZATION_LOG。
      结构性结论：纯函数有 200+ 自检，**组件层一条都没有**（渲染进程无 DOM 测试
      环境），所以残留 bug 会持续堆在这一半，且都是「看起来一切正常」的那一类
- [ ] 优先级 4：重复代码 / 长函数拆分（候选：report.ts 的 dailyStarCount 与
      starTrendBuckets 是同一件东西的两种算法，但一在主进程一在渲染进程，
      要共用就得把天数常量提到 src/shared/。**本轮不做**：两边都有自检钉着，
      搬常量属于动契约面，收益不抵风险 —— 已记入 OPTIMIZATION_LOG 的 R32）
- [x] 优先级 4（重复代码）：星标数 / 相对时间的格式化合成一份（2aa72a7，R28）——
      两处 `formatStars` 规则不同（toFixed(1) vs 四舍五入），同一个仓库在两个页面
      显示两个数；收到 lib/format.ts，旧位置改成纯 re-export（导出面不变）
- [x] 优先级 5（R26–R33，共 8 轮）：**同一类缺陷的最后一批收口**——
      单实例锁（5650a59，两个进程互相整份覆盖库文件）、Fork 拿新仓库替换原仓库
      （eb6fd08，内存与磁盘分家）、AI 分类全军覆没却把一份全「其他」当成功落盘 +
      补全结果按库合并（a02b35a）、库文件读坏后 Promise 被永久缓存导致只能重启
      （f201302）、OAuth 取消后拿到的 token 偷偷落盘（f201302）、读盘失败装成
      「你的收藏是空的」（f557e8c）、总览那张卡把滚动 7 天叫成「本周新增」（799e71a）、
      Token 徽章把「读不到」说成「未配置」（3510da8）
- [x] 优先级 5（R34–R36，共 3 轮）：推荐页两处「安静地说谎」+ Star 回读失败谎报
      ——「为你推荐」空态分叉（读盘失败不再说「你还没有收藏」，a59adc2）、
      失败的「换一批」不再吃掉一批（offset 改成成功后才写，a59adc2）、
      Star 的 PUT 已成立但回读失败时不再报成「Star 失败」（8082b9b）、
      同一类缺陷的下一层：Star/取消 Star 的**本地落盘**失败也不再说成
      「操作失败」（70072df）；
      另按优先级 6 记录修掉一处文档说谎：`GITHUB_TOKEN` 当前不被任何代码读取
      （8483ff5，中英 README + .env.example + config.ts 注释）
- [x] 优先级 5（R38–R40，共 3 轮）：同类缺陷的继续收口
      ——AI 配置卡片补「读不到」态与重试（4265d23）、「AI 总结」卡片说清正文
      不一定出自模型（bc83c55）、空态分叉改用新的 loadError 而不是"最近一次
      任何操作的失败原文"（4d99e12，`error` 有 13 个写入点，语义张冠李戴）
- [x] 优先级 5（R41，1 轮）：「AI 解释」出错后按钮真的能重试（92ce17e）——
      原来 error 态被当成"有内容"短路掉，那句"可以稍后再试"根本点不动；
      顺带补上 README 读不到那条分支的就地留字
- [x] 优先级 5（R44，1 轮）：本地标记没落盘 ≠ Fork / Clone 失败（de10c28）——
      R37 修的是主进程那侧，渲染进程这侧的 `updateLocalState` 还是走 unwrap，
      失败了照样报成"Fork 失败/克隆失败"，可 fork 已经建出来、目录已经在磁盘上。
      新增 persistLocalState()（不抛错，返回错误文案），两处都改成把后果说清；
      clone 那处刻意不更新内存态（假装已克隆会让"删除本地副本"必然失败）
- [x] 优先级 5（R45，1 轮）：**Star 列表在 300 条处静默截断**（7aad97f）——
      `fetchStarred` 的 MAX_PAGES=3 依据的那句"首页加载不能被无限翻页拖死"不成立
      （首屏读的是本地库，这条通道只在显式同步/测试连接时调用）；危害是双层：
      ① 界面报"已同步 300 个"看不出是截断；② mergeRepos 以远端为基准，
      第 300 名之外的仓库连同 cloned_path / forked_full_name 一起从本地列表消失，
      主进程对账也救不回来（真数据丢失）。循环本来就"不满一页就 break"，
      松阀门即可：3 → 20 页（2000 条）+ 撞上限时留 warn。
      新增 github-paging 自检（真实模式 + 打桩 fetch），**反向探针实测**：
      改回 3 页时前三条断言如期变红
- [x] 优先级 5（R46，1 轮）：**保存 Token 失败却清空输入框 = 谎报成功**（78f15c3）——
      `saveToken` 的签名 `Promise<void>` 没有位置传回"到底存进去了没有"，于是设置页
      无条件 `setToken('')`。而清空输入框本身就是一句"成了"：保存失败时照样清空，
      用户刚粘进去的 token 就没了，界面与成功无异，只能回去再拷一次。改成
      `Promise<boolean>`（失败仍不抛错，toast 由 unwrap 弹），调用方据此决定清不清空；
      契约文件同步。与 reloadAiConfig() 用返回值区分两件事是同一条约定
- [x] 优先级 6（R47，1 轮）：**src/main/index.ts 里两处 Phase 0 注释与代码相反**（bc96e42）
      ——`LOCAL_CANCEL_CLONE` 上还写着「cancelClone 恒返回 false，真正的实现在那个
      PR 里补」（其实早就真的 SIGINT 了），`refreshAiConfigCache()` 上还写着「Phase 0
      里这是个空函数」（其实它就是「保存后立即生效、无需重启」的全部依据）。
      危害与 R43 那份文档同构、且更近一层：文档里的错话会被存疑，源码注释里的常被
      直接当成事实——会让人不给取消入口，或排查"配了 key 却没生效"时先排除这条路径
- [x] 优先级 5（R48，1 轮）：**Token 解密失败被说成「未配置」**（同 R33 那个模子，只是
      走的是另一条路径）——`getToken()` 在密文解不开时（换机器 / keyring 变更）按设计
      降级返回 null，那是它那一侧的取舍（调用方 github.client() 只关心发不发得出请求）；
      可 `hasToken()` **不能跟着降级成 false**：false 在设置页的含义是「未配置」，
      等于把"读不出来"说成"从没配过"。现在 hasToken 只在「文件里确实没有 token」时
      返回 false，密文解不开时抛可读错误 → 渲染进程那套三态徽章原样接住，显示
      「读不到」+ 写明原因 + 重试。签名未变（它本来就为读盘失败抛错），
      selfcheck 新增两条断言（含换回原 keyring 后恢复 true），github.client() 的
      "未配置 Token" 文案也改成「没有读到」（两种含义都覆盖）
- [x] 优先级 5（R49，1 轮）：**主题「没记住」却照样说自己记住了**（e317ca5）——
      `persistTheme()` 把 localStorage 写失败整个吞掉（注释也认了），而设置页那句
      「并记住你的选择——下次启动会在界面出现之前就应用好」是一句承诺：存储被禁用 /
      配额满时它是假的，用户要等到下次启动主题莫名翻回去才知道。与 R46 同一条约定
      （「记住 / 保存」这类承诺得由写成功决定），丢的东西不同：那边是刚粘的 token，
      这边是一次选择。改成返回 boolean + 卡片说清坏掉的是哪一半（主题已切，没记住的
      只是"下次"）。**这条路没有自检可跑**（无 DOM 环境，localStorage 不可用也模拟不了）
- [x] 优先级 5（R50，1 轮）：**目录选择框还开着时，进度条显示上一次克隆的 100%**——
      原先的记录把根因写成"`CloneProgress` 没有 `startedAt`，前端分不出那是哪一次，
      要动冻结契约才能修"。**那个结论是错的**：不需要前端"分得出"，只要**别在错的
      时候去问**就行。`RepoActions` 拿 pendingAction 挂进度条与「取消克隆」，而
      pendingAction 从点下按钮就有值——用户可能还在原生目录选择框里待几十秒，这段时间
      进度条已经在轮询，读到的正是主进程**刻意留着**的上一次记录（local.ts 与
      clone-progress 自检都钉着"克隆结束后记录仍在，不闪回 null"）：一条 100% 的满进度
      + 上一次的「已用 312s」，看着像"这次已经跑完了"。修法：repoStore 新增
      `cloningFullName`（只在目录选完、clone 真的发出后才有值），进度条与取消按钮改挂它。
      主进程一侧一个字没动，"记录留在最后一条"这条被自检钉住的取舍继续成立
- [x] 优先级 5（R51，1 轮）：**凭据解不开时登录卡片变成死胡同**（修的是 R48 自己带出来
      的回归）——同一个 `hasToken()` 有第二个调用方：`GithubLoginCard` 把 `getState()` 与它
      放在同一个 unwrap/同一个 try 里，于是密文解不开一抛，整张卡片切到 unavailable
      （「读取登录状态失败，请查看应用日志」），**连登录按钮一起消失**。而归错因 + 关掉出路
      是叠在一起的：那卡片恰恰是唯一的解法（重新登录 = 写一条新的覆盖掉旧的），却把人指向
      一份对"换机器"零信息的应用日志。改成 hasToken 单独 catch：视图照常未登录、按钮留着、
      原因显示在按钮上方；登录成功与退出登录各清一次那条告警
- [x] 优先级 6（R52，1 轮）：**设置页把「加密落盘」说成无条件**——README 与
      module-signatures 都写了两态（safeStorage 可用则加密落盘；不可用则一个字节都不写盘、
      重启后需重填），唯独设置页那两句只有前一态，而它才是用户粘 Token / Key 时读的地方。
      危害是给了一个错误的持久化承诺：无 keyring 的机器上保存真的成功、徽章真的显示
      「已配置」，重启后却没了，用户视角是"它把我刚填的 Token 弄丢了"（同 R46 / R49
      那条约定）。只改文案。**把"这一次到底落盘了没有"告诉界面需要新通道**，记入残留
- [ ] 优先级 5：错误处理、日志、边界条件（继续；组件层是主战场）
- [ ] 优先级 6：文档与注释（继续；已开始扫 src/ 里的「实现状态」类断言）
- [x] 优先级 6：文档与注释（含 recommend.ts:271 那个粘在 export 上的 `*/`，已随
      d72df77 清掉）
- [x] 优先级 6（R42–R43，2 轮）：**又一批文档说谎**——中英 README 的通道数写 41/39
      （实际 43）、实现状态里把已落地的 recommend.ts 与 cancelClone 说成占位、
      演示路径指错页面（08cb020）；`docs/module-signatures.md` 里 Phase 0 骨架期的
      "落地状态"断言与现在的实现相反，最要命的是 local.ts 那三行说"cancelClone 恒
      返回 false、clone 从不返回 null"——照它读代码的人会绕开 cancelClone 自己造一套
      （24c908a）。两处都属"文档比没有更坏"

## 功能：本地副本落后追踪 + 快进更新（分支 `feat/local-clone-update`）

> 与上面那批 R 编号的修 bug 轮次无关：这是一次**新增功能**，从 main 另开的分支，
> 不塞进已开的 PR #32。三条决策已在动手前与用户确认：**只做快进**、**进页面自动检查**、
> **不落盘**。

**做了什么**：每个已 Clone 的仓库显示落后上游多少个提交（及领先 / 分叉 / 无上游 /
游离 HEAD / 副本不在 / 检查失败等诚实状态），支持单个「更新」与「更新全部」。
更新策略只有 `git fetch` + `git merge --ff-only`：绝不生成 merge 提交、绝不覆盖用户改动，
dirty / 分叉一律「拒绝 + 说明原因」，拒绝是**正常结局**（`refused-*`），不是失败。

**为什么这样切**：
- **判定顺序即正确性**，所以把顺序抽成零 git 依赖的纯函数 `src/main/localSync.ts`
  （`classifyLocalSync` / `decideUpdate` / `parseAheadBehind`），自检直接喂事实组合即可断言。
  顺序钉死：`missing → path-mismatch → not-git → fatal → detached → no-upstream →
  fetchError → ahead/behind 为 null → diverged → behind → ahead → up-to-date`。
  **`fetchError` 必须排在 behind/ahead 之前**——否则一次断网会拿过期的 `origin/*`
  引用算出"已是最新"，正是本功能最容易「安静说谎」的一处（有反向探针钉住）。
- **不落盘**：`LocalState` 一个字段没加，结果全在渲染进程内存（`syncByRepo`，
  **键缺席 = 未检查**是唯一真相来源）。落后数是"截至上次抓取"的瞬时事实，落盘后
  重启会拿它冒充此刻的事实；重启后界面如实显示「未检查」。
- **进页面自动检查**：页面保活、切走只是 `display:none`，组件察觉不到"又被看见了"，
  所以 `NavContext` 加了 `current`，`Manage.tsx` 用 ref 做**进入沿**判定 + 同一会话 20s
  节流（防快速来回切 tab 打出一堆 `git fetch`），StrictMode 双跑由 ref 吸收。
- **「更新全部」逐条报账**：`已更新 X / 已是最新 Y / 跳过 Z / 失败 W`，跳过与失败都带
  仓库名与原因，绝不弹一句光秃秃的「更新完成」。并发分三层（主进程 p-limit 3、
  store 的 `syncingAll`/`updatingAll` 闸、`RepoActions` 的 `busyRef`）。
- **Mock 模式**：`local.ts` 不伪造 git 数据，委派给 `mock.ts` 的 `mockLocalSync` /
  `mockUpdateLocal`（全项目唯一假数据源），自检断言**零 raw git 调用**。

**同批交付的另外三件用户要求的改动**（都由子代理起草、逐行核对后并入）：
① 发现仓库 / 为你推荐两处的仓库行都有 AI 解释（`RepoExplain`）；
② 「运行日志」页（设置与每周回顾之间），主进程新增 `logBuffer.ts` 环形缓冲 +
`log:tail` / `log:clear` 两条通道，**只镜像不接管**主进程 console、token/Key 脱敏、
被挤掉的条数如实报；③ 侧边栏左下角那块 v0.1.0 卡片换成 GitHub 账号块
（头像 / 昵称 / 就地登录退出，`useGithubAuth` 从设置页卡片抽成共享 hook）。
另按用户要求把「AI 收藏画像」从**手动点按钮**改成**进入总览自动生成**
（幂等决策：digest + 上次尝试时刻 + 单飞，失败后 60s 内不重试），并把「从分布图下钻到
收藏管理」的筛选改成**离开该板块即清空**（再进来是全量）。

**验证口径**：`npm run typecheck` / `npm run lint` 干净；15 个自检驱动器全绿
（新增 `local-sync`，扩展 `simple-git-stub` 加 `raw(args)`，并回归 clone-progress /
local-manage / clone-cancel / store-local）；`npm run build` 通过。
通道数 43 → **49**（新增 local 2 + ai 1 + log 2 + auth 1），README 中英 + preload +
`index.ts` 顶部注释四处同步。组件层仍**无 DOM 测试环境**，界面行为只能人工验收
（`! npm run dev`），已在 renderer-contracts 里写明。

## 已知的收尾事项
- **本轮刻意不修的两处**（都已记进 OPTIMIZATION_LOG，别当成漏掉的）：
  1. ~~`CloneProgressBar` 的进度条在克隆结束后可能停在 100% 不清零。根因是共享类型
     `CloneProgress`（src/shared/types.ts）里没有 `startedAt`，前端**分不出**
     "这个 100% 是刚刚那次"还是"上一次留下的"；靠时间阈值猜比留着更糟——
     而给类型加字段属于动冻结契约。契约放开之前不修。~~
     → **R50 已修，且上面这段推理是错的**：不必让前端分得出，只要别在目录选择框
     还开着的时候去问（那时主进程手里只有上一次的记录）。改挂 `cloningFullName`
     即可，主进程与冻结类型都没动。
  2. store 层的读改写竞态：`GITHUB_STAR` / `GITHUB_UNSTAR` 是
     `getRepos()` → 改数组 → `saveRepos()`，两次并发的读改写会丢掉其中一次的改动。
     触发条件是"同时点 Star 和取消 Star"（或与一次同步重叠），窗口极窄；
     正经的修法是给 store 加一个串行化的 mutate(fn)，属于新增公共 API，
     收益不抵本轮风险。留待后续。
  3. AI Key 解密失败被说成「未配置」：`getAiKey()` 在 safeStorage 解不开时
     （换机器、keyring 变更）返回 null，`getAiConfig()` 于是报 `source: 'none'`
     → 设置页显示「未配置」，与"确实没配过"是同一副面孔（同 R33 修掉的那个
     Token 徽章是一个模子）。**GitHub Token 那一半已在 R48 修掉**；AI Key 这一半
     还没修，因为它比 Token 那条多一道墙：要分开就得给 `AiConfigView` 加字段，
     而它被 `docs/module-signatures.md` 冻结（Token 那条能不改签名，是因为
     `hasToken()` 本来就有抛错路径可用；AI 这边没有任何一条现成的路可走，
     抛错会让「打开设置页」变成一次红 toast，因为 getAiConfig 是页面首屏就要的）。
     **危害小于 Token 那条**：重填一次 Key 就能自愈，用户不会因此丢掉什么。
  4. 「AI 总结」正文可能出自本地模板而不是模型（见 R39）。要精确标注就得给
     `WeeklyReport` 加字段 + 改 `generateReport` 的返回签名（均冻结，且契约里
     明写"任何失败都要返回兜底文案"）。本轮只在卡片上加了一行说明。
  5. **Star 列表在 2000 条以上仍会截断**（见 R45）：阀门从 3 页放到 20 页之后，
     个人账号基本不可能撞上，但撞上时界面依然看不出是截断的——`fetchStarred` 的
     返回类型是契约冻结的 `Promise<Repo[]>`，没有"还有更多"的位置可放，
     主进程只能留一条 warn。要真正解决得动契约（比如返回 `{ repos, truncated }`），
     连带 index.ts / preload / renderer 四方一起改，不属于原子改进。
  6. **界面分不出"这次 token 是真的落盘了、还是只进了内存"**（见 R52）：没有可用密钥环时
     `saveToken` / `saveAiConfig` 照样返回成功，渲染进程的 toast 与徽章与"已加密落盘"
     一模一样，用户要到重启后才发现 token 没了。R52 只在卡片上说清了这台机器可能是哪种
     情况。要真的分开，得让主进程把 `isEncryptionAvailable()` 报给界面（新通道 / 给
     `AiConfigView` 加字段，两者都动冻结面），不属于原子改进。
- **偶发（已解决）**：mock e2e 的「两个字段都在且 undefined 没抹掉值」在 R18
  定位到根因并修掉（ad230d1）。教训值得留着：**"连跑 N 次全绿"不等于不是 bug**，
  尤其是竞态——只差一个让其中一方变慢的条件（比如机器正被十几个自检进程压着）。
  当时那条注释把它猜成"IPC / 落盘时序"，方向对了一半，但真正的原因在 fixture 里。
  同类教训：写自检数据时，凡是要落进 store 的路径，就写一个真的存在的。
- recommend.ts:271 那个粘在 export 上的 `*/` 已清（d72df77）；同批还顺手把
  weekActivity 里写死的 `'未分类'` 换成 collectionStats 的 UNCATEGORIZED_LABEL
- ~~本分支基于**未合并**的 feat/ai-endpoint-agnostic（PR #31），若开 PR 到 main 会带上
  PR #31 的改动，需在描述里显著标注~~ → **已不成立**：PR #31 已合并进 main
  （origin/main 的 c8b9442 "Merge pull request #31"），本分支相对 origin/main 的 78 个
  提交（PR #32 创建时的数字）全部是夜间优化，开 PR 到 main 是干净的，描述里不必再提堆叠。
- IPC 表面三处一致（R37 顺手核对）：shared/ipc.ts 通道数 = index.ts handle() 调用数
  = preload 的 invoke 数 = 43，没有"声明了没注册/注册了没暴露"的通道
- 全量自检口径（R26–R33 之后跑过，全绿）：
  14 个非 Electron 驱动器（ai / ai-config / ai-concurrency / ai-provider / auth /
  clone-cancel / clone-progress / collection-stats / github-paging / local-manage /
  recommend-search / repo-query / store-local / week-report）+ 2 个 Electron e2e
  （store-local-e2e / store-local-e2e-realclone）。跑法：
  `node scripts/selfcheck/<名字>.mjs`，最后一行是汇总。
  （曾误写「13 个」：github-paging 是 R45 新增的，计数相应 +1。）
  **收尾时又整跑了一遍（本轮结束时）：16/16 全绿**，另加 tsc / eslint / build 全绿。
- 自检的经验教训（新增脚本时照做）：跑真实 Electron 的脚本必须带
  `--user-data-dir`（用 e2e-profile.mjs），且必须自己清干净目标目录再建，
  否则要么污染开发者数据、要么第二次跑就红/假绿

## 本轮收尾（autonomous 阶段结束时）
- 最后一次提交：R52 的日志（见 git log）。工作区**干净**，所有改动都已提交，
  `NIGHT_STATE.md` 与 `OPTIMIZATION_LOG.md` 都是最新的。
- 本轮（Phase 1 T1–T7 + Phase 2 R1–R52）全部落在
  `night/auto-optimize-20261002-0019`，相对 origin/main 领先 76 个提交。
- **已推送并开 PR #32**：https://github.com/Yuminghuang738/StarFlow/pull/32
  （base = main，MERGEABLE，73 个文件 +7976/−712；由用户在收尾后要求开，等他合并）
- 未修的东西都写在上面的「已知的收尾事项」里（6 条），另有一条只有主进程自检能覆盖、
  组件层一条自检都没有——这是本仓库当前最大的盲区：**渲染进程没有 DOM 测试环境**，
  这一半的缺陷只能靠人工验收，本轮里 R46–R52 有 6 轮属于这一半。

## 下一轮待办线索（只读审计 agent 报回，**尚未动手**）
跑完 R52 后起了一个只读 agent 扫组件层「安静地说谎」的那一类（它自己已排除本轮修过的
全部条目）。它说重扫的那批文件基本干净，报回 6 条，按它给的严重度排：

1. `repoStore.refreshFromGitHub()` **全程不写 `loadError`**（:176-189）：① 首次 load 失败
   之后同步成功（账号确实 0 star），空态仍说「读取本地数据失败」；② 更常见的是反向——
   初始 load 成功、之后点同步失败，只弹一条 3 秒 toast 且 `loadError` 仍是 null，
   Overview / RepoList / Similar 于是显示「还没有同步过 Star」并引导用户去配 Token，
   而用户刚刚才同步过。**（未逐行核对）**
2. `enrich()` 无条件弹「AI 分类补全完成」（:191-203）：主进程对单条分类失败只 warn、
   照样返回合并结果，所以部分失败时那句「完成」不成立，而且失败数完全不可见——
   用户会以为是「未分类」统计有 bug。**（未核对）**
3. Discover 的「按「q」找到 N 个仓库」把有上限的结果当总数（Discover.tsx:130；
   主进程 `github.ts:360` `SEARCH_LIMIT = 20`）。**已核对**：文案里没有任何限定词。
   与 `fetchStarred` 截断同一根因，但这是搜索结果处的新实例（那边已在 R45 记录）。
4. `GithubLoginCard` 的 `getState()` 失败会被**永久**定型成 unavailable 且没有重试入口
   （:152-156 / :246-253）；设置页是保活的，所以一次瞬时 IPC 故障能让登录按钮在本次
   运行内一直消失。与 R51 修的那条（hasToken 解不开）是**另一条路径**，那条现在正确。
   **（未逐行核对；触发窗口窄但一旦命中就是死胡同）**
5. AI Key 解密失败仍被说成「未配置」——即上面「已知的收尾事项」第 3 条，无新信息。
6. `Overview` 英雄区在 loadError 分支下仍渲染「你已经收藏了 0 个仓库」（`stats.total`
   因 repos=[] 而为 0），与紧接着那张卡「这不代表你的收藏是空的」自相矛盾；
   第一眼/截图看到的是那个被当成事实的 0。**（未逐行核对）**

agent 另报了两条它认为够不上"说谎"的观察，供参考：`formatRelative` 对未来时间戳一律
返回「刚刚」（只在时钟漂移时兜底）；Overview 语言分布条的比例分母含 language 为 null 的
仓库，而图上另有「未知」切片（口径不一致，但没把未知说成已知）。

## 约束备忘
- 不跑 `npm run dev`（GUI 需用户终端），验证靠 tsc / eslint / build / selfcheck
- 不跑 `npm run format`（prettier 会重排冻结契约）
- 渲染进程不得 import src/main/** 或 Node API
- 禁用 React `<Activity>`；keep-alive 靠 visited + hidden
- **页面级禁用 AnimatePresence**（保活的不卸载就没有 exit）；列表内部可以
- 禁止 any；AI 调用不得传 response_format；enrichRepos 并发严格 3
- 祖先带 transform 会让 position:fixed 的 ConfirmDialog 错位 —— 该元素内不要再套位移动画
