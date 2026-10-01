# NIGHT_STATE

phase: autonomous
start_epoch: 1790871552
total_budget_seconds: 28800
deadline_epoch: 1790899952

branch: night/auto-optimize-20261002-0019
base: feat/ai-endpoint-agnostic (PR #31, 未合并) —— 基于它而非 main，避免与已合并的 main 冲突，也不会改动 PR #31 分支本身

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
- [ ] 优先级 4：重复代码 / 长函数拆分
- [ ] 优先级 5：错误处理、日志、边界条件（继续）
- [ ] 优先级 6：文档与注释（含 recommend.ts:271 那个粘在 export 上的 `*/`）

## 已知的收尾事项
- **偶发（已解决）**：mock e2e 的「两个字段都在且 undefined 没抹掉值」在 R18
  定位到根因并修掉（ad230d1）。教训值得留着：**"连跑 N 次全绿"不等于不是 bug**，
  尤其是竞态——只差一个让其中一方变慢的条件（比如机器正被十几个自检进程压着）。
  当时那条注释把它猜成"IPC / 落盘时序"，方向对了一半，但真正的原因在 fixture 里。
  同类教训：写自检数据时，凡是要落进 store 的路径，就写一个真的存在的。
- recommend.ts:271 有个 `*/export async function forQuery`（注释结束符粘在 export 上），
  纯外观问题，可顺手清
- 本分支基于**未合并**的 feat/ai-endpoint-agnostic（PR #31），若开 PR 到 main 会带上
  PR #31 的改动，需在描述里显著标注
- 自检的经验教训（新增脚本时照做）：跑真实 Electron 的脚本必须带
  `--user-data-dir`（用 e2e-profile.mjs），且必须自己清干净目标目录再建，
  否则要么污染开发者数据、要么第二次跑就红/假绿

## 约束备忘
- 不跑 `npm run dev`（GUI 需用户终端），验证靠 tsc / eslint / build / selfcheck
- 不跑 `npm run format`（prettier 会重排冻结契约）
- 渲染进程不得 import src/main/** 或 Node API
- 禁用 React `<Activity>`；keep-alive 靠 visited + hidden
- **页面级禁用 AnimatePresence**（保活的不卸载就没有 exit）；列表内部可以
- 禁止 any；AI 调用不得传 response_format；enrichRepos 并发严格 3
- 祖先带 transform 会让 position:fixed 的 ConfirmDialog 错位 —— 该元素内不要再套位移动画
