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
