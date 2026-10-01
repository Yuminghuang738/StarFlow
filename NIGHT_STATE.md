# NIGHT_STATE

phase: deterministic
start_epoch: 1790871552
total_budget_seconds: 28800
deadline_epoch: 1790899952

branch: night/auto-optimize-20261002-0019
base: feat/ai-endpoint-agnostic (PR #31, 未合并) —— 基于它而非 main，避免与已合并的 main 冲突，也不会改动 PR #31 分支本身

tasks:
- T1: pending   # 栏目命名统一化
- T2: pending   # star 总览：增加 AI 统计分析栏目
- T3: pending   # star 管理：GitHub 式横条布局 + AI 一句话解释
- T4: pending   # 猜你喜欢：从「选单个仓库」改为基于全部 star 动态推送
- T5: pending   # 周报：结合实际 star 变动做 AI 总结
- T6: pending   # 整体布局与视觉现代化
- T7: pending   # 大幅增加动效与切换动画

## 约束备忘
- 不跑 `npm run dev`（GUI 需用户终端），验证靠 tsc / eslint / build / selfcheck
- 不跑 `npm run format`（prettier 会重排冻结契约）
- 渲染进程不得 import src/main/** 或 Node API
- 禁用 React `<Activity>`；keep-alive 靠 visited + hidden
- 禁止 any；AI 调用不得传 response_format；enrichRepos 并发严格 3
