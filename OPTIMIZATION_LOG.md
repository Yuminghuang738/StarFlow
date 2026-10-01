# OPTIMIZATION_LOG

每轮一条：轮次 / 任务 / 改了什么 / 验证命令与结果 / commit。

---

## R1 · T1 栏目命名统一化
done · commit 83c28bb

六个板块改名：发现仓库 / 收藏总览 / 收藏管理 / 为你推荐 / 每周回顾 / 设置。
改动：nav.ts + 5 个页面标题 + 2 处交叉引用 + 若干文档注释。key 未动。
验证：tsc / eslint / build 全绿。

---

## R2 · T2a 收藏总览：统计从 4 项扩到 30+ 项
done · commit 235965d

新增 `src/renderer/src/lib/collectionStats.ts`（纯函数，显式传入 now）：
仓库总数/总星标/平均星标/语言数/本周新增+上周对比/AI 已分类+未分类/clone/fork/
主题去重数/近期活跃(90d)/可能已停更(365d)/拿不到提交时间/语言榜 top6/
7 分类固定顺序桶/主题榜 top12/最热仓库。Overview.tsx 重写：8 张统计卡 +
语言与分类条形图 + 高频主题 + 最热收藏。
两个刻意的口径决定：①「本周/上周」按 **UTC 日历天**切（与 report.ts 一致，
本地时间会让东八区深夜的记录差一天）；② `pushed_at` 为 null 时计入
`unknownPush` 而**不是** stale——「拿不到」和「停更」混在一起，页面上的数字就在撒谎。
新增自检 `scripts/selfcheck/collection-stats.mjs`（40+ 断言，边界逐条卡）。
验证：tsc / eslint / build 全绿；自检全通过。

## R3 · T2b 收藏总览：AI 收藏画像
done · commit 48a93bb

新增第 42 条 IPC `AI_ANALYZE_COLLECTION`。**这是新增通道，动了 src/shared/ipc.ts
（文件头写着「冻结契约」）——但只增不删、不改 schema、不改生产配置**，属于夜间任务
规则允许的范围，PR 描述里需显著标注。
关键设计：摘要由**本地**算好（`buildAiDigest`）再喂模型，模型只解读、不统计——
让模型去数几十个仓库只会数错；且摘要只给聚合数字 + 一个最热仓库做锚点，
给的名字越多越容易复述甚至编造。
失败不抛错：未配置 / 超时 / 报错都以 `{ text: '', hint }` 返回，页面渲染成一行说明，
不弹红 toast（生成画像是可选增强，不是用户必答的操作）。未进页面就自动生成——
与「为你推荐」同一条约定：显式按钮。
自检抓到并修掉一个真 bug：`未分类` 桶在仓库非空时恒 > 0，导致「一条都没分类」时
输出成「AI 分类分布：未分类 12」——标题写着"分布"，内容却是空壳。改为真分类与
未分类分开措辞（`前端 2；另有 2 个未分类` / `（都还没分类）`），并补断言锁住。
验证：tsc / eslint / build 全绿；自检全通过。

---

## R4 · T3 收藏管理改成 GitHub 式横条 + AI 一句话解释
done · commit 1450403

卡片网格（一屏 6 个）→ 一行一个仓库（一屏十几个）。分隔线只画在外层容器上
（`border-b + last:border-b-0`），行自己不画边框，否则又变回一叠卡片。
骨架屏也换成横条样式——复用 SkeletonCard 会先闪一片方块再变横条，像布局跳了一下。
新增 `RepoRow.tsx` / `RepoExplain.tsx`，删除 `RepoCard.tsx`（只被 RepoList 用）。

AI 解释复用既有 fetchReadme → summarize 两条通道，**不加新通道**：
summarizePrompt 要的正是「一句话说清这个项目做什么」。点一次才请求一次
（列表几十行，进页面就自动解释等于几十次 AI 调用）；结果缓存到模块级 Map，
已有 ai_summary 的仓库一次请求都不发；失败走 call()（它弹 toast），
组件内只补一行就地说明，不重复弹。

验证：tsc / eslint / build 全绿。（卡片/横条的实际观感只能人工验收——
渲染进程没有 DOM 测试环境。）

## R5 · T4 为你推荐：从「挑种子」改为按整份收藏动态推
done · commit 7dfdb62

原来要求用户先从下拉框里挑一个仓库当参照，等于把「我到底喜欢什么」这个问题
又推回给用户——而答案早就写在收藏列表里。现在主进程把整份收藏压成画像
（主要语言 / 高频主题 / 主分类 / 星数地板），按画像拼最多 3 条查询去搜。
画像会显示在页面上，让推荐**有理由**，而不是一堆来路不明的卡片。

刻意的设计：
- **进页面自动搜一次**（与本项目其它页面的"显式按钮"约定相反）。推荐本身就是
  被动推送的东西；让用户先点一下「给我推荐」才给看，等于把推送变成查询。
  代价用 autoRan 守住"每次会话只搜一次"，要新的就点「换一批」。
- 三条查询分工：① 最强主题 + 主力语言；② 第二主题**不限语言**（收藏常跨语言，
  锁死语言会漏）；③ 第三主题 + 次语言。主题不够退到分类，再不够退到纯语言。
  星数地板取**收藏中位数 × 20%**（上下限 50 / 5000），比拍脑袋的常数稳。
- 3 条查询**串行**：GitHub 搜索认证后也只有 30 次/分钟，并发打过去用户连点两次
  就会撞 403，那看起来像功能坏了。
- 排序按「命中几条查询」降序，同分按星数——比接口返回顺序更可解释。

「换一批」是真的换：offset 循环位移画像里的语言/主题，并在拼串时去重。
`similar()` 与它的通道**都保留**（不删已公开的接口），只是界面不再走它。

⚠️ 新增第 43 条 IPC `recommend:forYou`，动了 src/shared/ipc.ts（冻结契约）——
只增不删、不改 schema、不改生产配置。顺带修掉 main/index.ts 里「41 个通道」
这句已经过期的注释（现在是 43；已核对通道数与 handle() 调用数严格 1:1）。

验证：tsc / eslint / build 全绿；recommend-search 自检新增第 7 节
（buildProfile / buildForYouQueries / forYou 端到端，30+ 断言）全通过。

## R6 · T5 每周回顾：结合实际 star 变动做 AI 总结 + 本周项目动态
done · commit e07d941

原来周报的 AI 总结只拿到「本周新增了哪些仓库」，不知道这些仓库**这周干不干什么**，
所以总结只能复述列表。现在多喂一份「本周内发过新版本的项目」清单，模型能说出
「你上周收的 X 这周出了 2.0」这种只有跨过时间轴才看得见的话。

三处刻意的决定：
- **不动 src/shared/types.ts**（WeeklyReport 是冻结契约）。主进程为了写提示词自己
  拉一次 Release，渲染进程为了那张结构化卡片**再拉一次**——这份重复是主动选的：
  让契约里多一个字段，等于所有构造 WeeklyReport 的地方（含自检里的 fixture）
  都要跟着改，代价比多几次 GitHub 请求大。
- 提示词里「没有新版本时一个字都不提新版本」。写提示词最怕的就是给模型一个
  话头，它会顺着编出几个不存在的 Release；自检里钉了一条断言专门守这个。
  Release 的 name 也**不写进提示词**，避免模型复述甚至扩写说明文字。
- collectWeekReleases 吞掉**所有**异常（含没配 Token 时 client() 直接抛），
  永远返回数组。这一块是周报的增强项，不能因为一个仓库查不到就让整份周报失败。

界面：统计行第三格原来是「Top 项目 = report.topRepos.length」，恒等于 5，是个
不会变也没有信息量的数，换成「本周新版本」；新增「本周项目动态」卡片（这周发了
新版本的收藏，带 tag 与日期），**没动静时整块不渲染**——安静的一周就该看起来安静。
「本周新增仓库」标题旁加了本周新增的分类分布 chips（与「语言分布」图不是一回事：
那张画存量，这里说增量）。

渲染进程侧新增 lib/weekActivity.ts（纯函数，只 import @shared/types）：pickWatchlist
（本周新增优先 + 星标榜补齐，去重截断 10）、pickLatestInWindow（闭区间卡边界，
每仓库只取最新，草稿 Release 跳过）、weekCategoryStats。拉 Release 时刻意**不用
lib/api 的 call()**——它失败会弹 toast，没配 Token 时 10 个仓库就是 10 条红 toast。

顺带把 MOCK_MODE 下 mockReleases 的最新一条挪到「现在」，否则本周项目动态在演示
模式永远空着，人工验收会以为功能没做。

新增自检 scripts/selfcheck/week-report.mjs（4 节 25 条断言，重点卡时间窗口边界：
周一零点 / 周日最后一毫秒算数，差一毫秒不算；以及「没有新版本时提示词里不能出现
新版本」）。⚠️ 中文分类顺序用 localeCompare，结果随运行环境 locale 变，所以那两条
断言写成「谁最多 + 其余各 1 条 + 集合相等」，不钉死中文先后。

验证：tsc / eslint / build 全绿；week-report / recommend-search / collection-stats
自检全通过；重打包 ai-bundle 后 ai / ai-concurrency 也全通过（并发峰值 3）。

---

## R7 · T6a 外壳：侧边栏加图标与分组标题，内容区固定滚动条槽位
done · commit 1bd4817

侧边栏原来六行纯文字平铺，看不出是一组导航。六个入口各配一个内联 SVG 图标
（刻意不引图标库）+ 一行「导航」分组标题 + 版本号改成小卡片。
内容区加 `[scrollbar-gutter:stable]`：各页长短差得多，不留位的话切板块时
滚动条突然出现/消失，内容会横向抖十几像素——典型的廉价感来源。
验证：tsc / eslint / build 全绿。

## R8 · T6b 抽出 PageContainer/PageHeader，三个页面先换过去
done · commit 51a53bb

宽度此前有 6xl/4xl/2xl 三种且说不清理由；标题、副标题、右侧按钮对齐各写各的。
新增 `components/layout/PageLayout.tsx`：Container 收成三档宽度并写明理由，
Header 统一图标徽章 + text-2xl 标题 + 副标题 + 操作区 + suffix 槽。
图标为此从 Sidebar 搬进 `navIcons.tsx`（两处必须同一套）。
本轮换 Discover / Similar / Manage。
验证：tsc / eslint / build 全绿。

## R9 · T6c 设置页改用 PageContainer，卡片不再自带外边距
done · commit 59d4c4e

「谁负责间距」原来有两套答案：容器管一档、卡片自己又挂 mt-4。统一归容器，
去掉 Settings 三个 Card + 末尾说明、以及 ThemeCard / GithubLoginCard（五个状态
分支）根 Card 的 mt-4，并留注释说明间距归外层管。
验证：tsc / eslint / build 全绿。

## R10 · T6d 周报与总览也换到 PageContainer/PageHeader
done · commit e974ce2

周报 `max-w-4xl` → width="medium"（容器用 gap-4 与页内 mt-4 的 16px 节奏对齐）。
总览的本地 PageHeader 改名 HeroHeader 并**复用**全局 PageHeader，自己只留 hero 卡
与渐变光斑（外面补一层 relative 压住 abs 的光斑）。
至此六页宽度与标题区走同一套，三档宽度不再有例外。
验证：tsc / eslint / build 全绿。

## R11 · T7 动效：板块切换 + 列表逐行 + 按钮按压 + reduced-motion 降级
done · commit 40302fc

1) 板块切换淡入上移。必须绕开一个坑：页面保活、切走不卸载，**没有 exit 就不能用
   AnimatePresence**。改用同一个 motion.div 的两种 animate 目标值（非激活态挂在
   opacity:0/y:6，被 display:none 挡着），成型观感一样而组件始终是同一个，页面
   状态一个字不丢。非激活态 transition 给 duration:0，否则六页在后台各空转 0.24s。
2) 列表逐行入场，18ms/行、最多第 12 行封顶（不封顶时几百行要等好几秒，像卡住）。
   刻意**只做透明度**：行里挂着 fixed 的确认对话框，祖先带 transform 会让它错位。
   只在挂载时播一次（key 是 repo.id，筛选来回不重播）。
3) 按钮 enabled:active:scale-[0.97] + focus-visible 焦点环；transition-colors 换成
   transition，否则 scale 瞬间跳变比不做还生硬。
4) reduced-motion：framer 走 JS 驱动、CSS 拦不住，所以 MotionConfig reducedMotion=
   "user" 与 CSS 媒体查询**两处都要管**。没采用 `* { animation-duration:.01ms }`
   一刀切——加载转圈是"正在进行"的唯一信号，停掉像卡死。
验证：tsc / eslint / build 全绿。

---

# Phase 2（autonomous）

## R12 · Phase 2 第 1 轮：摸清全量自检的底 → 修掉唯一一处红
done · commit ea7b36e

确定性目标 T1–T7 全部完成，按提示词进入 autonomous 阶段。第一件事不是继续改代码，
而是把自检脚本**全跑一遍**——本项目渲染进程没有 DOM 测试环境，自检是唯一
能挡住回归的东西，得先知道它现在是绿是红。

结果：15 个驱动器，14 绿，只有 `store-local-e2e-realclone.mjs` 红（5 项全失败）。

**根因不是功能，是 fixture 把平台写死了。** 两个真实 clone 自检都把
Windows 专有的 `http.sslBackend = schannel` 写进临时 HOME 的 `.gitconfig`，
而 Schannel 是 Windows 的 TLS 实现，别的平台 git 直接报
`fatal: Unsupported SSL backend 'schannel'`，于是任何非 Windows 机器上这两个
自检都必然全红——看着像 clone 坏了，其实一行产品代码都没参与。

这段配置的本意是好的是：simple-git 出于安全会剥掉子进程环境里**所有** `GIT_`
前缀的变量，所以 `GIT_CONFIG_COUNT` / `GIT_SSL_NO_VERIFY` 那套注入在应用里必然
无效（在 bash 里手跑 `git clone` 有效、在应用里无效，这个差异很坑），只能让它读
文件；而拦截式网络（TLS 中间人代理）下确实需要放宽证书校验。所以修法是**保留
意图、按平台分叉**，抽出 `scripts/selfcheck/fake-git-home.mjs` 统一这份配置：
Windows 用 `sslBackend=schannel` + `schannelCheckRevoke=false`，其余平台用
`http.sslVerify=false`。两者都只作用于这个临时 HOME，不碰用户真实的 `~/.gitconfig`。

⚠️ 这是 fixture 修复，不是放宽断言——夜间规则禁的是"改断言让测试过"，而这里改的是
本该正确却被写死的那份输入。断言一条没动。

验证（本机 Linux）：
- `npx tsc --noEmit` → 0
- `npx eslint scripts/selfcheck/` → 干净
- `store-local-e2e-realclone.mjs` → **7 PASS / 0 FAIL**（修前 5 FAIL）
- `store-local.mjs clone` → 6 PASS / 0 FAIL（同一份 fixture，一并受益）

## R13 · Phase 2：收藏列表排序（优先级 0 功能拓展）
done · commit 160ac5d

收藏上百个之后只有「GitHub 返回顺序」一种排法。新增四档：最近收藏（默认）/
星标最多 / 最近更新 / 名称 A→Z。默认档刻意选「最近收藏」，因为**它与改动前的
实际显示顺序完全一致**（GET /user/starred 本就按 starred_at 倒序返回，新 Star 的
又会 prepend），所以这次加排序不改默认观感——自检里有一条恒等变换断言专门守它。

纯函数 filterRepos / sortRepos / selectRepos 从 repoStore.ts 抽到 lib/repoQuery.ts，
理由与 collectionStats.ts / weekActivity.ts 一致：排序的边界（没有 pushed_at 的
排哪里、同分谁在前）在界面上完全看不出来——列表还是那么长、也还是有内容，
只是顺序悄悄错了位。抽出后只依赖 @shared/types，自检可直接打包进 node 跑。

两条刻意决定，都有断言钉住：
- **不原地 sort**：repos 数组直接来自 zustand store，原地排会改掉 store 里的顺序，
  而那顺序同时被周报 / 总览 / 推荐当作「收藏先后」在用。
- **拿不到时间一律当最旧**：pushed_at 为 null 时排最后，而不是被当成"最新"顶到最前。
  另刻意不写 `time(b) - time(a)`：两边都拿不到时间时差值是 NaN，规范虽然把 NaN
  当 0 处理，但那是隐式约定；写死比较方向更稳妥。

顺带修掉一处重复定义：筛选器初始值原本 store 里叫 INITIAL_FILTERS、FilterBar 里
又叫 EMPTY_FILTERS，两份手工同步。这次加 sort 字段正是活例子——只改一处的话
「重置」会悄悄不重置排序，界面上完全看不出来。统一成 DEFAULT_FILTERS 了。

新增自检 scripts/selfcheck/repo-query.mjs（39 条断言）。第一版有 1 条红，是**我的
fixture 期望写错**（把非法日期串排在了真实最旧之前），实现是对的——改断言而不是
改实现，因为那条规则另有断言在守，且实现符合注释里写明的口径。
验证：tsc / eslint / build 全绿；repo-query 39/39；mock e2e 11/11。
⚠️ 排序下拉的实际观感只能人工验收（渲染进程没有 DOM 测试环境）。

## R14 · Phase 2：e2e 自检隔离 userData（优先级 1 不稳定用例）
done · commit 6d1bd61

由 R13 收尾时的一次 FAIL 牵出来：mock e2e 的「初始 hasToken 应为 false」变红。
第一反应是自己的改动带坏了，查下来是**自检本身在污染开发者的真实数据**——
两个 e2e 都是拿真实 Electron 跑完整应用，db 就写在 app.getPath('userData') 下。

验证方式：同一 profile 连跑两次 mock e2e，第二次必红（第一次自己 saveToken 后
不清理）。再换成 --user-data-dir 指向空目录，同一条命令两次全绿——证明是状态
污染而非功能回归。

比"不稳定"更严重的是第二层：saveToken 会把开发者**自己的 GitHub token 覆盖成
测试串**，updateLocalState 往真实仓库记录里写 /tmp/e2e、me/e2e。跑一次自检就把
登录态弄没了。新增 e2e-profile.mjs 统一发 --user-data-dir（每次先删干净），
mock e2e 与 realclone 都接过去。

store-local.mjs 的 runReal 刻意**没加**这个开关并留了注释：real-entry 自己就
mkdtemp + app.setPath('userData')，而 setPath 在启动后跑、命令行开关压不过它。
（这条是被自己的错误注释逼出来的——先写了"必须隔离"，查证后发现不成立。）

同轮还修掉 realclone 的同类陷阱：它只 mkdir 目标目录、不清理，直接跑第二次时
首次 clone 会撞上一轮的 Hello-World 返回「目标目录已存在」——「返回完整绝对路径」
变红，而紧跟的「重复克隆应是这个错」因为**同样的原因**假绿。现在自己先 rm 再 mkdir。
这正是"看日志像网络问题"的那类假象。

验证：eslint 干净；mock e2e 连跑 2 次全绿，且 ~/.config/star-flow/starflow.mock.db.json
的 mtime 前后完全一致（真实 userData 一个字节都没被写）；realclone 直接跑 3 次
全绿（每次 7 PASS / 0 FAIL）。

## R15 · Phase 2：补齐筛选维度（活跃度 + 未知语言）
done · commit 2eb0c50

接着 R13 往下做。收藏管理页此前**只有**关键词 / 语言 / 分类 / 只看已 clone 四个条件，
而总览页算出来的「近期活跃 40」「可能已停更 12」「拿不到提交时间 3」在列表里
一个都筛不出来——数字告诉你有一堆该处理的，却没法把它们捞出来。

新增两档筛选：
- **活跃度**：全部 / 近期活跃（90 天内）/ 可能已停更（一年以上）/ 拿不到提交时间。
- **未知语言**：FilterBar 里那条注释写着这是个"补不了的洞"——language 的类型是
  `string | null`，而 null 早被约定成"全部语言"，没有第三个态可用。
  改成显式的 `'all' | 'unknown' | \`name:${string}\`` 三态后这个选项才落得下来。

关键设计是**只有一处阈值**。判定抽成 collectionStats 的 `activityBucket()`
（返回 'active' | 'middle' | 'stale' | 'unknown'），筛选与统计都调它，
computeCollectionStats 自己那个 if 也改成 switch 走同一个函数。各写一遍 if 迟早
漂移，而漂移之后页面只是在安静地撒谎——卡片写 40、点进去筛出 38，
两个数字都"看着对"。自检里为此有一条硬断言：`stats.activeRecently` 必须等于
`filterRepos({health:'active'}).length`，三个档各来一条。

`middle`（90~365 天）刻意**不做成下拉项**：总览页上没有它对应的数字，
单独列一项只会让人问"这是个啥"。但它必须存在——三档不是划分，中间有一段空档，
自检里专门放了一个落在空档里的 fixture 守着这件事，防止有人"顺手"把三档改成
互斥且完备（那样上面的卡片就不对了）。

语言的具体值加了 `name:` 前缀，是为了不与 `'unknown'` / `'all'` 两个保留字撞车：
真出现一个语言叫 "unknown" 时，裸字符串会把两者混为一谈。fixture 里就放了一个
语言名为 "unknown" 的仓库，断言 `language:'unknown'`（保留态）与
`language:'name:unknown'` 筛出的是**不同**的仓库。

`filterRepos` 因此多了 `now` 参数（活跃度按"距今多久"判，藏在函数里读时钟就没法
喂假数据卡 90 / 365 天的边界，这与 collectionStats 是同一条约定）。Manage 在
useMemo 里取 `Date.now()`——放进依赖数组等于每帧重算，memo 就白写了。

顺带：tsc 逼出了一处**已经漂移的**重复定义。RepoList 的空列表里还有第三份手写的
重置清单，R13 加 sort 时被漏掉了（"重置筛选"之后排序仍是用户选的那个）。
现在两处重置都走 `DEFAULT_FILTERS`。这正好印证了 R13 里统一常量那个决定。

自检从 39 条扩到 67 条。

验证：tsc / eslint / build 全绿；repo-query 67/67、collection-stats 49/49（把统计
循环改成走 activityBucket 之后数字一个没变，是有力的回归证据）、week-report 28/28。

⚠️ 遗留：mock e2e 的「两个字段都在且 undefined 没抹掉值」这条断言**观察到过一次
偶发失败**（约 1/13）。主进程 `updateLocalState` 开头就过滤 undefined 键、逻辑是
确定的，所以更像是 IPC/落盘的时序问题而不是功能 bug；随后连跑 12 次全绿，
未能复现，暂记为已知偶发项待查（见 NIGHT_STATE 的收尾事项），没有为了让它变绿
去改断言。

## R16 · Phase 2：总览统计卡可下钻到收藏管理页
done · commit 4d61cfb

总览页写着「可能已停更 12」「已 Clone 8」，用户看到的第一反应是"哪 12 个"。
数字就在眼前，却只能靠侧边栏手点过去、再把筛选重新选一遍——没有去处的行动项
等于没写。R15 把筛选维度备齐之后，差的就只是一个跨页导航。

**为什么用 context 而不是 zustand**：页面在 App.tsx 里按 `{ key, render }` 渲染、
**不收 props**，这正是保活的结构基础（见 App.tsx 顶部那段说明）——为了传一个回调
把 PAGES 改成带参数的形式，等于拿保活去换。把 tab 状态搬进 store 也不行：
tab 与 visited 是必须同步更新的一对本地状态，拆开更容易出现两者不一致。
于是新增 NavContext，**只暴露 `goTo` 一个动作**，谁持有状态不关调用方的事。
`useNav` 取不到就抛错，不做"返回空实现"的静默降级——点了没反应又不报错的按钮
是最难查的一类问题。

**drill 必须整份替换筛选器，不能合并**。用户在管理页可能留着上次的搜索词或语言
筛选；若只 patch 一个字段，卡片写 12、点进去只剩 3 条，而页面上没有任何东西提示
"还叠着别的条件"。约定本身抽成了 `filtersFor(patch)`（从 DEFAULT_FILTERS 打底再
覆盖）放进 lib，因为页面里的闭包自检断言不到，纯函数才卡得住。顺带它还保证了
将来新加的筛选字段不会在下钻时被漏掉。

**刻意保留不可点的四张卡**：本周新增（没有时间窗口这个筛选维度）、主题标签、
语言数（它是去重后的类别数、不是条数）、AI 已分类（数的是**所有**分类过的仓库，
而 category 筛选一次只能选一个，点进去必然只剩一小撮）。不可点好过点了跳到一个
数字对不上的列表——那比不可点更糟。

**类型上的一个坑**：`isRealCategory(b.name) ? () => drill({ category: b.name }) : undefined`
编译不过。被收窄的是**属性路径** `b.name`，TS 不把它带进闭包（属性随时可能被改），
category 那格退回 `string`。抽成 `byCategory(name: string)` —— 普通参数、全程不重新
赋值，收窄就保得住。同理 `drill({})` 用于「仓库总数」，跳到管理页且不带任何条件。

自检新增第 7 节（+7 条）：空 patch 等于默认筛选器、下钻只覆盖指定项其余回默认、
`filtersFor` 不污染 DEFAULT_FILTERS，以及落点断言——`selectRepos(filtersFor({health:'stale'}))`
的条数必须**等于** `computeCollectionStats().stale`，onlyCloned 对 cloned 同理。
这条把"卡片上的数字"与"点进去看到的条数"锁在一起，与 R15 那条硬断言同一个思路。

验证：tsc 干净、eslint 干净、npm run build 通过、repo-query 74/74（R15 是 67）、
mock e2e 11/11。

## R17 · Phase 2：分类筛选补上「未分类」态
done · commit f2d008f

总览页写着「还有 12 个未分类」，这是整页最可行动的数字，而此前**没有任何办法**
把它筛出来：`category` 的类型是 `AiCategory | null`，而 null 早被约定成"全部分类"，
第三个态无处安放——和 R15 里语言那个"补不了的洞"是同一个毛病，连修法都一样。

改成 `'all' | 'uncategorized' | AiCategory` 三态。**这里刻意不加 `name:` 前缀**：
AiCategory 是固定 7 个枚举、取值域封闭，'all' / 'uncategorized' 撞不上；语言那边
必须加前缀，是因为它的取值域是"任意字符串"，真出现一个叫 "unknown" 的语言时
裸字符串会把两者混为一谈。两处的差异是有理由的，不是不统一。

**判据必须同源**：filterRepos 里未分类走 `if (r.ai_category) return false`，
与 collectionStats 数 `categorized` 的 `if (r.ai_category)` 是同一个表达式的正反面。
各写一遍的话，卡片写 12、点进去 10，两边都"看着对"——这正是 R15 用 activityBucket
收掉阈值重复时的那条教训，这次落在分类上。

`UNCATEGORIZED_LABEL` 从 collectionStats 导出：桶名叫 `'未分类'`、筛选态叫
`'uncategorized'`，**是两个不同的值域**，页面得靠这个常量做一次映射。
Overview 的 `byCategory` 就是把桶名映射过去的那一步；要是图省事把桶名直接当筛选值
传下去，filterRepos 会拿它去和 `r.ai_category` 严格相等比较，筛出空列表——
点一下「未分类 12」，列表直接空了。

hero 区那句「还有 N 个未分类，可到「收藏管理」跑一次 AI 补全」本来是纯文字：
它告诉了用户有个入口，却不把人送过去。现在它本身就是按钮。

「AI 已分类」那张卡仍然**不可点**。诱人，但它数的是所有分类过的仓库，
而 category 筛选一次只能选一个——点进去必然只剩一小撮，卡片写 N、点进去 M 就是
撒谎。可行动的是它的补集，不是它本身。

自检新增第 8 节（+13 条）。除了划分性与保留值那几条，落点断言是：
`selectRepos(REPOS, filtersFor({category:'uncategorized'}), NOW).length`
必须等于 `computeCollectionStats(REPOS, NOW).uncategorized`。另外两处随 API 变更
改形的断言（`category: null` → `category: 'all'`）强度不变，不是为了让测试变绿。

验证：repo-query 87/87（R16 是 74）、collection-stats、week-report、recommend-search
全绿；tsc 干净、eslint 干净、npm run build 通过、mock e2e 11/11。

## R18 · Phase 2：定位并修掉 e2e 那条偶发红（优先级 1 收口）
done · commit ad230d1

R15 记下的「两个字段都在且 undefined 没抹掉值」偶发失败（约 1/13），当时连跑 12 次
没能复现，只能记为待查。本轮定位到了，原因**和 undefined 毫无关系**：

那条断言写 `cloned_path: "/tmp/e2e"`，而 /tmp/e2e 在本机不存在。应用启动时渲染进程
`load()` 的末尾会跑一次 clone 对账（pruneLocalClones）→ 主进程
`listMissingCloneRecords` 的判据是「cloned_path 找不到、但**父目录在**」就当作记录过期
清掉——/tmp 在、/tmp/e2e 不在，正中判据。所以这条记录**一定会被清**，区别只在于
清在 e2e 那几次 IPC 写入之前还是之后：输了就是 cloned_path 没了、forked_full_name 还在，
正是观察到的那个"像 undefined 抹掉了值"的样子。

复现不出来也不奇怪：对账只在 load() 里跑**一次**，正常时序下它早于 e2e 的写入完成，
之后不会再有第二次对账来捣乱。要输掉这场赛跑得让渲染进程那次 load 明显变慢——
跑全量自检时机器被十几个进程压着，恰好就是这个条件。**所以"连跑 12 次全绿"当时
并不构成"不是 bug"的证据**，只是没撞上而已。

修法：让 cloned_path 指向一个真实存在的目录（mkdtempSync 建、跑完删），
断言本身一字未改。**这是修 fixture，不是放宽断言**。

顺带把原因钉成两条新断言：写入一个"父目录在、自己不在"的路径 → pruneClones 必须
把它报出来 → 读回时 cloned_path 被清、fork 标记保留。好处有两个：将来谁再往这里
塞假路径，有一处显式说明拦着他；另外 pruneClones 是一条平时完全静默、界面上看不见
的 IPC，这两条是它第一次有回归覆盖。

清理临时目录要套 try：清理失败（杀进程时的占用之类）不该把一轮全绿的断言变成红的。

验证：eslint 干净；e2e 13/13（原 11 + 新增 2），连跑 40 次全绿、无临时目录残留。

## R19 · Phase 2：语言下拉的候选项必须包含当前选中项
done · commit 6a94cc7

这一条属于「边界条件」那一档，但它踩的是本项目最忌讳的坑——**页面在安静地说谎**。

语言下拉的候选是从 `repos` 现推的，而 `filters.language` 是独立的一份状态。
两者一旦对不上（被选中的语言在这批收藏里已经没有了），原生 `<select>` 的 value
在 option 里找不到匹配项，就会变成"没有选中项"：界面上一片空白，而 store 里那个
筛选还在生效。用户看到一个空列表，看不出是哪个条件在起作用——「重置」按钮虽然会亮
（isDirty 算得对），但那也只是给了个不知道怎么触发的出口。

凑出这种数据不难：先按 Rust 筛，然后在 GitHub 上取消收藏最后一个 Rust 仓库，
回来点一次同步，Rust 就从 repos 里消失了，而筛选器还指着它。

修法是让候选**无条件**包含当前选中的语言，抽成 lib 的纯函数
`languageOptions(repos, current)`。放 lib 而不是组件里，理由和 R13 把筛选排序抽出来
一样：渲染进程没有 DOM 测试环境，组件里这个判断写错了没人看得见；纯函数才能喂数据
把边界卡住（比如"空列表 + 具体语言"这种在本机永远走不到的组合）。

`languageNameOf` 在这里顺带起到了另一层作用：'all' / 'unknown' 两个保留态对它返回
null，于是它们不会作为候选项混进下拉——否则下拉里会多出一个 value 就叫 "all" 的语言
选项，和保留字撞成同一个值。

自检新增第 9 节（+9 条）。除了上面这些，还有一条盯着语言名真的叫 "unknown" 的仓库：
它以 `name:unknown` 的形态出现在候选里，与保留态 `unknown`（未知语言）是两个不同的
option value——这条把 R15 的三态设计从"筛选"一侧延伸到了"候选项"一侧。

验证：repo-query 96/96（R17 是 87）、tsc 干净、eslint 干净、npm run build 通过、
mock e2e 13/13。

## R20 · Phase 2：把「本周新增」接上下钻（优先级 0 候选收口）
done · commit fd2f412

R16 把总览的统计卡接成下钻入口时，刻意留了四张卡不可点，理由是「凑不出一个条数
恰好等于它的筛选，点了就是撒谎」。其中三张（AI 已分类 / 语言数 / 主题标签）确实
凑不出来，但「本周新增」是**能**凑出来的——只是当时缺一个筛选维度。这一条把它补上。

新增的维度是"收藏时间"，与已有的"活跃度"是两回事：一个仓库可能 2019 年就 Star 了
但上周刚 push。所以不能复用 `health`，得单开一档。

设计上唯一值得说的还是**阈值只有一处**。`collectionStats` 里本来就有
`todayStart` / `recentStart` / `prevStart` 三个局部常量，在 `computeCollectionStats`
里算一次、用完即弃；筛选那边如果照抄一份 `>= todayStart - 6 * DAY`，两份就开始各自
演化。所以这次把它们抽成 `starredBucket(repo, now)`——与 `activityBucket` 完全同构：
计数那边 `switch (b) { case 'week': recent7 += 1 }`，筛选那边
`starredBucket(r, now) !== 'week'` 就淘汰。自检里直接钉了
`stats.recent7 === filterRepos({onlyRecent: true}).length`，两处永远不可能悄悄分家。

`'prevWeek'` 这一档的存在理由与 `activityBucket` 的 `'middle'` 一样：趋势文案
（比上周多/少）需要它，界面上却没有对应的筛选，所以它必须存在、但不必做成一个选项。
`'unknown'`（starred_at 解析不出来）同理不计入任何一档——和 `activityBucket` 里
"拿不到 push 时间 ≠ 停更"是同一条原则：null 是「拿不到」，不是「归零」。

顺带修掉一处自找的麻烦：上周的下界原来写成 `(2 * RECENT_WINDOW_DAYS - 1) * DAY`，
读的人得在脑子里推一遍才敢信它对。改成 `start - RECENT_WINDOW_DAYS * DAY`——就是
「上一个窗口 = 再往前整整一个窗口」这句话本身，不需要推。

界面上是一个开关：「只看最近 7 天新增」，那个 7 由 `RECENT_WINDOW_DAYS` 拼出来
（写死数字的话，改了窗口文案就开始骗人——这条在 R15 就立下了）。`isDirty` 把它算
进去，否则「重置」会让这个开关失效而按钮不亮。下钻照旧走 `filtersFor`（整份替换
而非叠加），所以卡片写 5、点进去就是 5 条。

自检新增第 10 节（+13）：四个档的边界各钉一条（今天/6 天前进 week，7 天/13 天前
进 prevWeek，14 天前进 earlier）、窗口长度跟着 `RECENT_WINDOW_DAYS` 走、1ms 边界、
四档对 fixture 构成划分、`stats.recent7`/`prev7` 各为 2、下钻整份覆盖不与用户
当前条件叠加。

验证：repo-query 109/109（R19 是 96）、collection-stats / week-report /
recommend-search 全绿、tsc 干净、eslint 干净、npm run build 通过、mock e2e 13/13。

## R21 · Phase 2：活跃度的天数只有一处，四处文案都从常量拼
done · commit f5a7313

R15 立下「阈值只有一处」这条规矩时，只管住了**计算**：`activityBucket` 是唯一
判档的地方。但「90 天」「一年」这两个**说法**还散落在四处各自写死——总览卡片的
两句提示、筛选下拉的两个选项文案、给模型的摘要。改阈值的人不会去看下拉框里写了
什么，于是阈值一变，界面就在描述一件代码没在做的事：「近期活跃（90 天内）」
实际筛的是 60 天内，而所有代码都跑得好好的。

修法是把 `ACTIVE_WINDOW_DAYS` / `STALE_WINDOW_DAYS` 导出，四处文案从它们拼。
与 R15 的 `RECENT_WINDOW_DAYS` 是同一个套路，这次只是把剩下的两个常数补齐。

两个附带的判断：

1. **文案里统一写数字，不写「一年」。** 365 天究竟等不等于"一年"，
   读代码的人不该被要求先替我们做一次换算；而旧文案「超过一年」多出来的那个
   "超过"还和判据 `age >= 365d` 差了整整一天——365 天整那天到底算不算，
   旧文案说的是不算，代码说的是算。
2. **措辞的严格性必须与判据一致。** active 写「N 天内」（不含整 N，判据是
   `age < N`），stale 写「N 天以上」（含整 N，判据是 `age >= N`）。措辞反了的
   话，边界断言还是绿的，只有用户会看到"筛选说 90 天内，可 90 天整的那个没进来"。
   自检里把这两件事对着钉在一起。

自检方面：repo-query 新增第 11 节（+9）钉「下拉文案与摘要必须含常量」（常量一改
就红，硬编码的 90 会被逮住）、「文案里不许再出现一年/个月这类换算」、以及措辞与
边界的对照；collection-stats 补两条——拿不到提交时间的仓库在摘要里必须单独一句
（原来那条断言覆盖不到它，因为那个数据集全是有效的 `pushed_at`：**断言在场 ≠
断言有效**，这是本次撞到的第二个坑），以及摘要里的三个数字与统计结果一致。

同时把 repo-query fixture 里与阈值有关的 `pushed_at` 改成用常量算：写死 200 天
的话，阈值一变那条 repo 就悄悄跑到别的档里去，「两档之间的仓库不属于任何一档」
这条断言会跟着一起失效，而且失效得毫无提示。
collection-stats 第 3 节里 90 / 365 的字面量则**保持不动**——那几条断言测的正是
边界本身，独立手算的期望值才有意义。同样是数字，一处该跟着常量走、一处不该，
区别在于它是"构造数据"还是"期望结果"。

有一条既有断言被改写（「活跃度三态都带上了」钉的是旧措辞）。措辞这次是有意改的，
所以断言跟着改；同时把天数换成引用常量、把「拿不到时间的单独说一句」挪到真正能
触发它的数据集上——是加强，不是放松。这与 R17 那次改 `DEFAULT_FILTERS.category`
的断言是同一类：**被 API 变更重塑的断言**，而不是被"改到能过"的断言。

验证：repo-query 118/118（R20 是 109）、collection-stats 51/51、
12 个非 Electron 自检全绿、tsc 干净、eslint 干净、npm run build 通过、mock e2e 13/13。

## R22 · Phase 2：趋势图的分桶抽成纯函数，天数跟着 RECENT_WINDOW_DAYS 走
done · commit 1d99138

R20/R21 把「本周新增」这扇窗的阈值收成了一处，但绘图那边漏了：近 7 天新增折线图
在组件的 `useMemo` 里现算，桶数写死 `for (i = 6; i >= 0)`、标题写死「近 7 天新增」。
它和「本周新增」卡片、列表的「只看最近 N 天新增」是**同一扇窗**，而三处的 7 各写了
一遍——窗口一改，卡片写 14、图上还是 7 个点，两个数字并排躺在同一页上互相打脸。

抽成 `collectionStats.starTrendBuckets(repos, now)`，顺带导出 `utcDayKey`。
抽出来的真正理由不是「代码要短」，而是**能不能断言**：渲染进程没有 DOM 测试环境，
图渲染不出来，组件里的分桶写错了没人看得见；纯函数才能把
「图上加起来 == 卡片上的数」这条关系直接钉住（新增第 8 节，+11 条）。

`utcDayKey` 单独立出来是因为它是本项目的**日期坐标约定**——主进程 report.ts 的
dateKey 就是这个写法，东八区深夜收藏的记录落在哪一天全看它。两处各写一遍
`toISOString().slice(0,10)` 的话，代码一样、语义一样，但改的时候一定会漏一处。

还有一条钉住**刻意保留的差异**：`starred_at` 落在未来的记录（时钟偏差）会被
「本周新增」数进去，却落不进任何一个桶——最后一个桶是"今天"，图上没有"以后"。
不迁就一条异常数据把坐标轴画到明天，但要把这条不一致写下来，免得哪天被当成
bug"顺手修掉"；修了它（比如把未来的记录塞进最后一个桶），卡片与图又会分家。

验证：collection-stats 62/62（R21 是 51）、repo-query 118/118、其他非 Electron
自检全绿、tsc 干净、eslint 干净、npm run build 通过、mock e2e 13/13。

## R23 · Phase 2：一个只读排错 agent 捞出的一批真缺陷（1/3）
done · commit 81564e3

R20 之后我起了一个只读的排查 agent，专门找组件层「页面在安静地说谎」那一类缺陷
（渲染进程没有 DOM 测试环境，纯函数自检覆盖不到的地方）。它报回来 7 条，
逐条复核后落实了 5 条，分成三个提交。这是第一个。

**Button 的 disabled 被 `{...rest}` 覆盖。** 原文：

```
<button disabled={loading || rest.disabled} className={classes} {...rest}>
```

rest 里带着调用方传的 disabled，展开在后、后来者胜。只要调用方**显式**写了
`disabled={...}`（哪怕算出来是 false），loading 算出的 true 就被抹掉。受影响的
是 Discover 的搜索按钮（`disabled={draft.trim() === ''}`）和设置页的「清除密钥」：
搜索中还能再点，白打一次 AI 规划 + 一次 GitHub 搜索。组件文档白纸黑字写着
"loading：显示转圈并自动 disabled"——**文档是真的，代码不是**；而界面上那个
转圈还在转，看起来一切正常。修法是把 disabled 解构出来再拼。

**「从 GitHub 同步」与「AI 补全分类」可以同时跑。** Settings 的两个按钮各自只绑
自己的忙碌态，而 `enrich()` 是在**发请求那一刻**取 `get().repos` 当输入的：

```
set({ repos: await unwrap(window.api.ai.enrichRepos(get().repos)) })
```

同步会把它整份换掉，于是先完成的同步会被后完成的补全用旧列表覆盖——用户看到
「已从 GitHub 同步 N 个仓库」的 toast，列表里却少了刚同步回来的那些，而且主进程
也把这份旧列表落了盘。Manage.tsx 的 `headerBusy` 早就把这两个按钮一起禁掉了，
说明"互斥"是既定意图，只有设置页漏了。

这两个改动**有依赖关系**，值得记一笔：设置页那两个按钮是显式传 `disabled` 的，
没有上面那个 Button 修复，这里的互斥根本不会生效——它会被 `{...rest}` 盖掉。

验证：tsc 干净、eslint 干净、npm run build 通过、12 个非 Electron 自检全绿、
mock e2e 13/13。

## R24 · Phase 2：只读排错 agent 的一批缺陷（2/3）
done · commit d72df77

**周报的「本周新版本」把查询失败显示成 0。** `loadReleases` 刻意吞掉每个仓库的
失败（没 Token 时 10 个仓库就是 10 条红 toast 把整页刷满），但吞掉之后它就**降级
成了"这周没动静"**——卡片于是理直气壮地写出「本周新版本 0」。那句 0 是个结论，
而真相是接口一次都没成功。页面本来就有"未知"态（`activity === null` 时显示 —），
失败却绕过它落到了 0 上。

现在把失败数带回来，三种态分开：还在查（—）、一个都没查成（— 加一行
「查询失败（Token 或限频）」）、查到一部分（数字仍然可信，另标「另有 N 个没查到」）。
**吞掉报错是可以的取舍，把"不知道"降级成"确实没有"不是。**

**周报的「本周新增趋势」图与「本周新增 Star」卡不是同一扇窗。** 图取
`dailyStarCount`（从今天往回数的滚动 7 天），卡取 `newStars`（本周一 00:00 UTC 起的
日历周），两者只有恰好周日才相等。周三打开这一页会看到卡片 3、图里 20，用户只能
以为其中一个算错了。标题改成「最近 7 天新增趋势」，天数从数据现算（不写死），
并在 report.ts 那处写明：想改成日历周就得连着卡片口径一起改。

这一条与 R22 是同一主题的两面：R22 说「同一扇窗的三个说法必须共用一处阈值」，
R24 说「**不同的窗不能共用同一个词**」。「本周」这个词在总览/发现页指滚动 7 天、
在周报卡片指日历周，界面必须自己把它说清楚，不能指望用户去读代码。

顺手清掉两个小瑕疵：recommend.ts:271 那个粘在 export 上的 `*/`（纯外观，
读代码的人得先愣一下）；weekActivity 里那份写死的 `'未分类'`——collectionStats
早就导出了 `UNCATEGORIZED_LABEL`，两处各写一遍的话，改了其中一处就会出现两个
只差一个字的分组。

验证：tsc 干净、eslint 干净、npm run build 通过、12 个非 Electron 自检全绿、
mock e2e 13/13。

## R25 · Phase 2：只读排错 agent 的一批缺陷（3/3）
done · commit ce68307（另有 3898ae7 是其中那条字符串的小改）

**确认对话框只是画出来，键盘够不着它。** `role="dialog"` / `aria-modal` 都有，
但打开时没有把焦点移进面板，也没有焦点陷阱，关闭后更不还回去。调用方是列表里那些
「取消 Star / 删除本地副本」——键盘用户按 Enter 打开之后，焦点还留在被遮罩盖住的
那一行上，继续 Tab 会在**背景列表**里穿行：看得见问题，按不到回答。

最能说明问题的是 `Button.tsx` 里那句注释：「加了 forwardRef（ConfirmDialog 要拿
确认按钮做自动 focus）」。那个实现从来不存在——**注释比代码新**，而这次排查正是
照着注释去查才发现它是空的。

现在三件事都做了：打开时把焦点移到确认按钮、Tab 在两个按钮之间循环（焦点跑到
面板外也拉回来）、关闭后还给触发它的那个元素。两个实现上的坑值得留着：

1. **焦点 effect 的依赖只写 `open`**，刻意不写 `onCancel`。这个 effect 有清理逻辑
   （还焦点），依赖里多一个每次渲染都变的函数（调用方传的是内联箭头），就会每次
   重渲染都跑一遍「还焦点 → 再夺回来」——用户 Tab 到「取消」上之后，后台随便一次
   store 更新都会把焦点弹回确认键。Esc 的处理因此拆到另一个只挂监听器的 effect 里。
2. **`e.stopPropagation()` 在这里挡不住任何东西。** 监听器挂在 `window` 上，
   stopPropagation 既拦不住同一节点上的其它监听器，也拦不住已经冒泡到 window 的
   事件——它只会给读代码的人一个「我处理了」的假象。这一条我一度写进去了，
   复查时删掉了。

**`RepoExplain` 的初始文本只在挂载时取一次。** 行按 `key={repo.id}` 复用，跑完
「AI 补全分类」后 repo 换成带 `ai_summary` 的新对象，但组件实例不重挂，`text` 一直
停在空串——那行明明已经有摘要了，按钮却还写着「AI 解释」，点下去还会再抓一次
README、再调一次 AI。这条通道的整个设计就是"点一次请求一次"，白花的额度是实打实的。
加一个**单向**同步的 effect：补全结果只填进空位，绝不覆盖用户已经点出来（或在飞）
的内容。

至此 R20 留下的那个 `known` 死变量收尾了。

### 关于这次排查方式本身
这三轮（R23–R25）的缺陷全部来自一个**只读**的排查 agent，我给它的题是
"找组件层「页面在安静地说谎」那一类缺陷"。它的价值不在于"多一双眼睛"，
而在于**覆盖面的盲区**是结构性的：`collectionStats` / `repoQuery` / `weekActivity`
这些纯函数有 200+ 条自检钉着，而组件层一条都没有——渲染进程没有 DOM 测试环境，
是明写在约束里的。所以真正的 bug 会持续堆积在自检覆盖不到的那一半，
而且**都是"看起来一切正常"的那一类**（按钮在转圈但能再点、卡片写着 0 但没有数据、
注释承诺了一个不存在的功能）。

它报回的 7 条里我采纳了 5 条、拆成 3 个提交。**没采纳的 2 条**也记一下，
理由比结论重要：

- 「周报的 dailyStarCount 与 starTrendBuckets 是同一件东西的两种算法」——
  这是已知项（NIGHT_STATE 里挂着候选），但它真正指出的是**不同的窗共用了同一个
  词**，那一条我采纳了并改掉了图示标题（见 R24）。
- `FilterBar` 防抖与外部整份替换筛选器的竞态：触发条件是"打完字 200ms 内跨页点
  下钻条"，正常手速下不可达。**不修**，但记在这里——它是真实存在的，
  只是修它的收益抵不上引入的复杂度。

验证：tsc 干净、eslint 干净、npm run build 通过、12 个非 Electron 自检全绿、
mock e2e 13/13。
