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
- [ ] 优先级 0（继续）：总览统计卡可点击下钻到管理页并带上下面对应的筛选
      （R15 已把筛选维度备齐，下钻只差一个跨页导航；App.tsx 目前 PAGES 无 props，
      需要一个 nav context 或 zustand 的 ui store）
- [ ] 优先级 1：mock e2e 那条偶发断言（见收尾事项）
- [ ] 优先级 2：类型 / lint（当前干净，需持续复查）
- [ ] 优先级 3：性能热点（**必须有实测证据**；echarts 按需引入已排除——渲染进程无
      DOM 测试环境，漏注册组件只在运行时炸，不可验证）
- [ ] 优先级 4：重复代码 / 长函数拆分
- [ ] 优先级 5：错误处理、日志、边界条件
- [ ] 优先级 6：文档与注释

## 已知的收尾事项
- **偶发（待查）**：mock e2e 的「两个字段都在且 undefined 没抹掉值」观察到过一次失败
  （约 1/13），随后连跑 12 次全绿、未能复现。主进程 updateLocalState 的 undefined
  过滤逻辑是确定的，更像 IPC / 落盘时序问题。**没有改断言**去让它变绿。
  继续跑全量自检时若再遇到，先记下当时的构建/运行顺序再判断是不是"紧跟在
  npm run build 之后"这个特定次序触发的。
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
