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

## R26 · Phase 2：加单实例锁（优先级 5，边界条件）
done · commit 5650a59

**两个进程各开一份同一份库文件，会互相整份覆盖。** `store` 的落盘是"整份替换"
（`db.data.repos = repos; await db.write()`），而两个实例各自在内存里维护一份
`reposCache`：A 存了 Star、B 不知道，B 下一次写盘就把 A 的那条抹掉了。
用户看到的是"刚 Star 的仓库过一会儿自己没了"——而且**没有任何一处报错**。

Electron 应用被双击两次图标就会真的起两个进程（Linux 桌面尤其常见），
这不是理论问题。加 `app.requestSingleInstanceLock()`：拿不到锁的直接 `quit()`，
拿到锁的把 `whenReady` 之后那一整段抽成 `bootstrap()`（抽出来是为了让
"重定向到已有窗口"那段和启动路径共用同一个 `mainWindow` 变量，不抽就得把
窗口引用提到模块级），并监听 `second-instance` 把已有窗口 restore + show + focus
——否则用户双击第二下会以为程序没反应。

验证：tsc 干净、eslint 干净、npm run build 通过。
（R26–R33 全部落地后又统一跑过一次全量自检：13 个非 Electron 驱动器 + 2 个
Electron e2e，全绿。）

## R27 · Phase 2：Fork 不再拿「fork 出来的那个新仓库」替换原仓库（优先级 5）
done · commit eb6fd08

`repoStore.fork()` 原来把 `github.fork()` 的返回值当成"原仓库的更新版"塞回列表。
而它是**你 fork 出来的那个新仓库**：`full_name` 变成了「你的用户名/repo」、
`stargazers_count` 是新 fork 的 0、`id` 也是新的。于是那一行当场改名换姓、
星标掉到 0、点进去跳到 fork 而不是原仓库。

更糟的是它**会扩散**：下次同步时 `mergeRepos` 拿这个名字去匹配远端列表，
匹配不上——原仓库被当成新仓库重新插进来（fork 标记丢了），而磁盘上主进程记的
一直是原名。内存与磁盘就此分家，且两边都"看着正常"。

fork 的语义本来就只是"给原仓库打一个标记"，原仓库一个字段都不该动。
现在只 map 那一条，从返回值的 `local.forked_full_name` / `forked_at` 取值
（真实与 mock 两条路径都已经填好了；`?? repo.full_name` 只是拿不到 fork 名时的
兜底），落盘仍然用**原仓库**的 full_name 当键——与 index.ts 的约定一致。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R28 · Phase 2：星标数/相对时间的格式化合成一份（优先级 4，重复代码）
done · commit 2aa72a7

`formatStars` 与 `formatRelative` 各有两个实现，规则还不一样：
`lib/api.ts` 里那份 `formatStars` 用 `toFixed(1)`（12345 → `12.3k`），
`components/repo/repoFormat.ts` 里那份用四舍五入（12345 → `12k`）。
两个页面各导入一个，**同一个仓库在两个页面上显示两个不同的星标数**。
`formatRelative` 同样：一份对解析不出来的时间返回空串，另一份返回 `'时间未知'`。

新增 `lib/format.ts` 收成唯一实现（取"四舍五入 + 小写 m/k"那套规则，
以及 `'时间未知'` 那个更诚实的兜底），两个旧位置改成纯 re-export——
导出面保持不变，`pages/Report.tsx` 那种 `from '../lib/api'` 的调用点一行都不用动。

放在 `lib/format.ts` 而不是 `repoFormat.ts`，是按本项目已有的**纯模块**约定来的：
只依赖 `@shared/types`、不碰 `lib/api`（后者 import 了 Toast，进而 import React），
这样 esbuild 打包的自检驱动器才能在 node 里直接跑它。

验证：tsc 干净、eslint 干净、npm run build 通过、既有自检全绿。

## R29 · Phase 2：分类全军覆没时不再把一份全「其他」的结果当成功写盘（优先级 5）
done · commit a02b35a

`classify()` 的对外契约是"失败就降级成 `'其他'`"——这对单个仓库是合理的取舍。
但 `enrichRepos` 把它当成了补全成功：一批仓库全部因为限流/网络挂了，结果是
**一整份写着「其他」的列表被落盘**，界面上显示「AI 分类补全完成」。
用户看到的是"分类完了，但全是其他"，而真相是一次都没成功；更早的分类结论
也被这个假值覆盖掉了。

两处改动：

1. `enrichRepos` 记 `attempted` / `failed` / `firstFailure`，**全失败时抛错**
   （`` `${attempted} 个仓库一个都没分类成功（${firstFailure}）` ``），一个字节都
   不写盘；部分失败时成功的照常落盘，但失败的那个**保留原分类**、
   从来没分类过的仍然是"未分类"——绝不臆造一个「其他」。
2. 写盘改成 `mergeAiResults`：以**库里的当前内容**为基准，只把这次拿到的
   `ai_category` / `ai_summary` 按 full_name 合并进去。

第 2 条修的是另一半：补全要跑几分钟，这期间用户完全可能 Star 了新仓库、
取消收藏了旧的、或者 clone 完了一个仓库，而 `saveRepos` 是整份替换——
原实现写进去的是**开始那一刻的快照**，这几分钟里的改动全部丢失。
合并方向是刻意选的"库为准"：这期间被取消收藏的**不该被复活**，
库里没有的条目也不会凭空插进去。

自检 `ai-provider-entry.ts` 补了两节（6、7）：全失败抛错且磁盘不动、
部分失败两种语义、补全期间的 clone 记录 / 新 Star / 取消收藏各自守住。
写自检时踩到一件事值得记：第一次跑是"成功的结果落了盘 :: 0 条"——
合并以库为准，而库里当时是空的。这说明自检必须先 `saveRepos` 把前置条件
摆成**应用里的样子**（应用传进来的那份就是"从库里读出来的列表"）。

验证：tsc 干净、eslint 干净、npm run build 通过；ai-provider 驱动器新增两节全绿。

## R30 · Phase 2：库文件读坏时不再永久卡死 + OAuth 取消后拿到的 token 不落盘（优先级 5）
done · commit f201302

**`getDb()` 把一个失败的 Promise 缓存到了进程结束。** "文件读不出来"是**可以
自愈**的状态：用户把坏 JSON 挪走、或换台机器把文件放回来，下一次读就该成功。
可是缓存住的那个 rejected Promise 会让之后每一次调用直接拿到同一个拒绝——
用户把文件修好了，应用照旧全盘报错，只能重启。现在失败后清空缓存，
下一次重新读盘。

顺带把这句错误说清楚：JSON 解析失败的原文只有一句 `Unexpected token …`，
单看它根本不知道是哪个文件出的事。包一层把**文件路径**带上，并说明
应用不会自动删除或覆盖它（用户才知道该去哪儿处理）。

还纠正了一句我自己写错的注释：原来写着 lowdb 的 `read()` 会深合并默认值，
所以旧库文件缺的键能靠 `defaultDb()` 补齐。**去 `node_modules/lowdb` 里读了实现
才发现是整份替换**（`Low.read()` 里就一句 `this.data = await this.adapter.read()`），
所以 `defaultDb()` 每个键都必须给全，读取处一律 `?? ''` / `?? null` 兜底。

另一处是 auth：`poll()` 开头那次 `f.settled` 检查在 `await` 之前，
而用户点「取消」完全可能正好落在这条 POST 飞行的那几百毫秒里——
`cancelDeviceFlow` 看到 `phase` 仍是 `'polling'` 会放行，把流程 settle 成
`cancelled`。不复查就继续走 `exchange()` 的话，token 照样落盘，
于是出现「界面说已取消、其实已经登录了」：之后同步能成功、重启后徽章变
「已配置」，用户根本不知道中间发生了什么。现在拿到 token 后**重新**检查一次，
是取消就丢弃（要登录再点一次，设备码每次都会重发）。

验证：tsc 干净、eslint 干净、npm run build 通过；store-local / auth 驱动器全绿。

## R31 · Phase 2：读盘失败不再装成「你的收藏是空的」（优先级 5）
done · commit f557e8c

"一条数据都没有"和"这一次没读到"在界面上长得一模一样，而给用户的下一步动作
正好相反：后者要重试，前者才该去配 Token。原来两者都落到
「还没有数据 → 先到设置页配置 GitHub Token」——于是用户去重配 Token、重新同步，
而真正的原因（本地库文件读不出来）从头到尾没被说出来。

这是个**复合谎**：不仅把"不知道"说成了"确实没有"，还给出了一个错误的行动建议。

- `repoStore.load()`：开头 `set({ loading: true, error: null })`。`error` 是
  "这一次读取的结果"而不是"历史上出过错"——不清的话，重试成功之后它还挂着，
  而下面两处现在会把它画出来，就会在一次成功的加载之后继续显示"读取失败"。
  这也与 `refreshFromGitHub` / `enrich` 已有的写法一致，`load` 本是唯一的例外。
- `RepoList` / `Overview`：`repos` 为空且有 `error` 时走"读取失败"分支——
  错误原文照登（那句话里有真正的原因：文件损坏 / 权限 / 主进程没起来，
  概括成"出错了"等于把它扔掉），另加"这不代表你的收藏是空的"和一个重试按钮。

验证：tsc 干净、eslint 干净、npm run build 通过。
（渲染进程没有 DOM 测试环境，这两处渲染分支只能人工验收——与既有约定一致。）

## R32 · Phase 2：总览那张卡不再叫「本周新增」（优先级 5）
done · commit 799e71a

同一个词「本周」在应用里指**两扇不同的窗**：周报页那张「本周新增 Star」卡是真的
日历周（report.ts 的 `weekStart`，本周一 00:00 UTC 起），而总览那张卡是
`recent7` = 「含今天在内往回数 7 个 UTC 日历日」，周三打开时它已经跨到上周二
去了。两者只有恰好周日才相等。

而这个数**还同时出现在总览页自己的折线图上**，那里写的是「近 7 天新增」——
同一页、同一个数、两个名字，其中一个暗示了它并不是的东西。用户按日历去核对
卡片与周报，只会对不上账。

改法是把滚动窗那一侧统一叫「近 N 天」（它才是诚实的名字），日历周侧不动：
卡片标签 →「近 N 天新增」，`trendHint` 的「上周」→「前 N 天」，给模型的摘要里
「本周新增 X 个，上周 Y 个」→「最近 N 天新增 X 个，前 N 天 Y 个」（模型拿到
「本周」会按日历周解读）。天数一律从 `RECENT_WINDOW_DAYS` 拼。

其余 5 处是注释/断言里的指路牌（StarTrendChart / FilterBar / repoQuery / 自检），
不改就会指向一个已经不存在了的标签。自检顺带把措辞钉住：摘要里必须出现
「最近 N 天…前 N 天…」且**不许出现「本周」**。

有一条候选顺手记在这里：`report.ts` 的 `dailyStarCount` 与
`starTrendBuckets` 仍是同一件东西的两种算法（一在主进程、一在渲染进程），
要共用就得把天数常量提到 `src/shared/`。今天没做——两边现在都有自检钉着，
而把常量搬进 shared 属于动契约面，收益（少一份实现）不抵风险。

验证：tsc 干净、eslint 干净、npm run build 通过；collection-stats 驱动器全绿。

## R33 · Phase 2：Token 状态徽章不再把「读不到」说成「未配置」（优先级 5）
done · commit 3510da8

`repoStore.hasToken()` 的 catch 原来 `return false`。false 在设置页的含义是
「未配置」——于是库文件坏掉 / 主进程没起来时，**明明存着 token 的用户会看到
「未配置」徽章**，被引去重填一遍，而真正的原因从头到尾没被说出来。又是同一类：
可以吞掉报错，但不能把"不知道"降级成"确实没有"。

- `hasToken(): Promise<boolean | null>`，失败返回 **null**（不知道）而不是 false。
  `unwrap` 仍然弹 toast，这里只把结论收成三态。
- 设置页徽章因此变成四态：未读完「未知」/ 读不到「读不到」（warning）/
  已配置 / 未配置。原来 `null` 只有"还没读"一种来源，现在两种含义必须分开渲染。
- 顺带补一个「重试」按钮：设置页是保活的（切换页面不卸载），没有它这个徽章会
  一直停在「读不到」，唯一出路是重启应用。
- `docs/renderer-contracts.md` 里那条签名跟着改（该文件自己要求新成员必须同步）。

另一处同类调用点（GithubLoginCard 登录后读 `hasToken`）已经是诚实的：
失败走 catch → 「读取登录状态失败」，不谎报"未登录"，所以不动。

验证：tsc 干净、eslint 干净、npm run build 通过。
（徽章的三态渲染同样只能人工验收。）

## R34 · Phase 2：「为你推荐」空态分叉 + 失败的「换一批」不再吃掉一批（优先级 5）
done · commit a59adc2

两条都属于**推荐页在安静地说谎**，和 R31/R33 同一族。

1. `Similar.tsx` 在 `repos.length === 0` 时只有一种空态：「还没有可以参照的收藏，
   先去配 Token」。可列表为空有两个来源，下一步动作正好相反——**读盘失败**时
   该点「重试」，不该去重配 Token、重新同步（那条路走完也还是空的）。
   现在按 `repoStore.error` 分叉：失败一侧显示原始报错 + 「这不代表你的收藏是空的」
   + 重试按钮（重试成功后 repos 变非空，上面那个 autoRan 的 effect 会自动补推荐）。

2. `loadForYou` 原先**乐观地**把 offset 写进 store，失败也照样"消耗"掉一批：
   页面提示"再点「换一批」重试"，而按钮走的是 `offset + 1`，重试搜到的是再下一批。
   被跳过的那批用户永远不会看到，界面上也没有任何东西提示漏了一批。
   改成成功后才写 offset——失败时它停在最后一次成功的位置，重试的就是原来那批。
   （`searchSeq` / `forYouSeq` 的竞态保护原样保留。）

验证：tsc 干净、eslint 干净、npm run build 通过。

## R35 · Phase 2：Star 成功后回读失败不再谎报「Star 失败」（优先级 5）
done · commit 8082b9b

`star()` 原先是**一个大 try**：`PUT /user/starred/{owner}/{repo}`（204 即成功）
之后紧跟 `repos.get` 回读，用来拼出返回给前端的 `Repo`。回读失败时，catch 统一
抛「Star xxx 失败：…」——而 Star 早就真的生效了。

这是把一次**成功**说成失败，代价比沉默高一档：用户会去重试（对幂等的 PUT 无害，
但他不知道）、去 GitHub 上核对（会看到确实 Star 了，于是怀疑是这个应用坏了），
最糟的是他可能反过来再点一次「取消 Star」"清理"。

拆成两段 try：第一段失败才是真的失败；第二段失败换成一句说清现状的话——
「已经在 GitHub 上 Star 了 X，但没能读回它的详细信息（…）。到「收藏管理」点一次
「从 GitHub 同步」就能把它拉进列表。」同步一次确实能补上（`fetchStarred` 走的是
`/user/starred`，与这次回读无关），所以给出的下一步是真能走通的。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R36 · 优先级 6（文档）：`GITHUB_TOKEN` 这个键当前不被读取
done · commit 8483ff5

README（中/英）把它标成「真实模式必需（或改用应用内登录）」，`.env.example` 给了
一个裸的 `GITHUB_TOKEN=`，`config.ts` 也照样 `process.env.GITHUB_TOKEN ?? ''` 读进
`getEnv()`——**但全仓库没有任何调用方读 `getEnv().githubToken`**（grep 过 `src/` 与
`scripts/`，对该键的引用只有声明与赋值两处）。

真实生效的 token 只有两条来路：应用内「用 GitHub 登录」（Device Flow，`auth.ts`）
或设置页手填，两者都写进本地数据文件，由 `store.getToken()` 读出。

后果是文档指了一条死路：照 README 做的人填好 `.env` 启动，然后在应用里看到
「未配置 GitHub Token」，无从知道该怀疑哪一步——而这正是本轮的贯穿原则要收的那类
缺陷（把"这里不通"说成"你没配"）。

改法：
- `README.md` / `README.en.md` 的表格行如实写「当前版本不读这个键」+ token 的真实来路；
- `.env.example` 在那行上方加注释说明为什么不生效；
- `config.ts` 的 `githubToken` **字段不能删**（`getEnv()` 的返回形状被
  `docs/module-signatures.md` 冻结），所以就地留一条注释封住"它是个死字段"这件事，
  免得下一个人又照着它写文档。

【后续候选，本轮不做】也可以反过来让 env 真的生效（`store.getToken()` 里加一层
`?? getEnv().githubToken` 兜底），那是新增行为、且会让一份过期的 `.env` token 伪装成
"已配置"（然后 401）。应用内登录才是设计意图，所以选改文档。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R37 · Phase 2：Star / 取消 Star 的本地落盘失败不再报成「操作失败」（优先级 5）
done · commit 70072df

R35 修的是 `github.ts` 里"回读失败"那一层，这一轮是同一类缺陷在**再下一层**：
`index.ts` 的 `GITHUB_STAR` / `GITHUB_UNSTAR` handler 把「GitHub 侧调用」和
「写本地列表」放在同一个 try 里，于是 `saveRepos` 失败（库文件不可写、磁盘满）时，
用户看到的是「Star 失败」——而 GitHub 上的 Star 早就生效了。

unstar 那侧更刺眼：GitHub 上已经取消了，界面报"取消失败"，而列表里那张卡还在
（本地没删成），两件事合起来把用户推向"再点一次"——他不会知道**第一次其实成功了**。

改法：两段 try 分开报错。GitHub 那一步失败才是真的失败；本地落盘失败则明说
「已经在 GitHub 上 Star/取消了，只是本地列表没更新（原因）」，并给出真能走通的
下一步（到「收藏管理」同步一次：「从 GitHub 同步」是拿 `/user/starred` 整份重建，
两个方向都能靠它纠正回来）。顺带把包装器里取错误文案的那行提成 `errText()`，
两处共用（只有这一处复制，不值得再抽 lib）。

验证：tsc 干净、eslint 干净、npm run build 通过；
全量自检重跑——13 个非 Electron 驱动器全绿 + `store-local-e2e`（真实 IPC 通道）全绿。
另核对了 IPC 表面三处一致：`shared/ipc.ts` 的通道数、`index.ts` 的 handle() 调用数、
`preload` 的 invoke 数都是 43，没有"声明了没注册"或"注册了没暴露"的通道。

## R38 · Phase 2：AI 配置卡片补齐「读不到」态与重试（优先级 5）
done · commit 4265d23

R33 给 Token 徽章做了三态（未知 / 读不到 / 已配置 / 未配置），AI 配置卡片却只有
两态：`aiConfig === null` 一律显示「未知」。而设置页是保活的（切换板块不卸载），
读一次失败之后这个「未知」**永远不会再变**，唯一出路是重启应用——用户不知道该
点哪里，也看不出是自己的库文件有问题。

- 读完就标记 `aiConfigChecked`：没读完说「未知」，读失败说「读不到」+ 一句
  「不代表你没配过」+ 「重试」按钮。与 Token 那个重试各管各的（读取路径不同，
  很可能只有一个失败）。
- `reloadAiConfig()` 改成**不抛错**，返回"这次读到了没有"。两个理由：
  ① 它被保存/清除路径 await，抛出会把「保存成功、随后读一次状态失败」整件事
  报成失败，而保存明明成功了（现在提示分开说："已保存，但状态这一次没读回来"）；
  ② 卡片上的「重试」是 onClick 直接调的，抛出就是没人接的 unhandled rejection。

【刻意不修，已记入 NIGHT_STATE】`getAiKey()` 解密失败（换机器 / keyring 变更）
会被 `getAiConfig()` 报成 `source: 'none'` → 「未配置」，与"确实没配过"仍是同一副
面孔。分开需要给 `AiConfigView` 加字段，而该类型被 `docs/module-signatures.md`
冻结（类型顶上那句"想往这里加字段之前先读契约"就是为这个写的）。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R39 · Phase 2：「AI 总结」卡片说清正文不一定出自模型（优先级 5）
done · commit bc83c55

`ai.generateReport` 的冻结约定是：任何失败（没配 Key / 401 / 限频 / 断网）都要
退回一段**本地按数据拼的**摘要，绝不抛错。于是周报那张卡的标题写着「AI 总结」，
正文却可能一次模型调用都没发生——刚配好 Key 的人来看一眼，看到一段通顺的话就会
以为 Key 通了，而真正该做的动作（去「测试 AI 连接」/ 查 Key）完全没被提示到。

加一行脚注说明这段的来路，并指向「测试 AI 连接」。刻意**不**给 `WeeklyReport`
加"这段是谁写的"字段：那要动共享类型与 `generateReport` 的返回签名（两者都在
`docs/module-signatures.md` 里冻结，且第 165 行明确写着"任何失败都要返回兜底文案"）。
这里需要的只是一句能让用户正确解读的话，说得含糊（"配好之后由模型生成"）比说错强。

顺带核对：同页的「本周新版本」与总览的「AI 收藏画像」都已经是诚实的三态
（前者 `activity === null / 全军覆没 → — / 数字`，后者主进程用 `{ text, hint }`
把"为什么没有"带回来），本轮不动。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R40 · Phase 2：空态分叉改用 loadError，不再拿"最近一次任何失败"当判据（优先级 5）
done · commit 4d99e12

`repoStore.error` 有 **13 个写入点**（star / unstar / clone / openDir / fork /
saveToken / enrich / hasToken …），而读它的只有三处，三处问的都是同一个问题：
「列表为什么是空的」。语义从根上就不匹配，于是出现张冠李戴——

可复现的路径：新装、收藏为空 → 去「发现仓库」点 Star → 没配 Token，Star 失败，
`error` 被写成「未配置 GitHub Token…」→ 打开「收藏管理」：列表为空且 error 非空，
于是渲染成「读取本地数据失败」＋「这不代表你的收藏是空的，本地数据都在」＋那句
Token 报错原文。一句诊断里三个错误结论，而真相与本地数据毫无关系。

- 新增 `loadError`：**只有 `load()` 会写**，并在起始处清零（R31 那条"重试成功后
  不能还显示读取失败"的约束原样保留，只是搬到这个字段上）。
- `error` 保留原义（最近一次任何操作的失败原文，供排查），三处界面改读 `loadError`。
- `docs/renderer-contracts.md` 补上该成员，并写明"两个字段别混用"。

为什么不是反过来（让 error 只表示读取失败、删掉另外 12 处写入）：那些写入点是
"最近发生了什么错"的唯一记录，删掉之后失败只剩 3 秒的 toast（`unwrap` 弹的），
排查时什么都没有。两个字段各司其职更诚实。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R41 · Phase 2：「AI 解释」出错后要能重试，三条失败分支都要就地留字（优先级 5）
done · commit 92ce17e

`RepoExplain` 的按钮逻辑是「text 非空 = 已经有解释了，这次点击只是展开/收起」。
问题是三条失败分支（README 读不到 / README 太短 / AI 返回空）也会往 `text` 里写
一句失败说明——于是那句"可以稍后再试"成了空话：按钮只把错误说明收起来，根本
发不出第二次请求，唯一的出路是切走页面再切回来（组件因此重挂）。这正好是"界面
在安静地说谎"的最典型形态：它承诺了一个它做不到的动作。

- 短路条件加上 `status !== 'error'`：出错之后这个按钮必须能再发一次请求。
- `readme === null` 分支原来**什么都不写**（只弹 toast，3 秒后消失）。现在与另两条
  一样就地留字，否则这一行看起来与"从没点过"完全一样。
- 按钮标签在 error 态显示「重试」而不是「AI 解释」——否则用户点开一段错误说明，
  会以为那是一次解释的结果。
- 顶部注释把"三条失败分支都必须就地留字 + 之后必须能重试"写成约定。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R42 · Phase 2/6：中英 README 里一批过期的实现状态与通道清单（优先级 6）
done · commit 08cb020

README 是外部读者判断"这东西现在能干什么"的唯一入口，里面几处断言与代码不符：

- 通道数写 41（中文）/ 39（英文），三处都是；实际三端一致为 **43**（含
  `github:star` 英文版漏了、`ai:analyzeCollection`、`recommend:forYou`）。
- 「实现状态说明」说 `recommend.ts` 与 `local:cancelClone` 是占位——两者都已落地，
  真正剩下的只有 `tracker.ts` 的真实模式分支。
- AI 配置那段说"持久化待实现"，而 `store:getAiConfig / saveAiConfig / clearAiKey`
  与 `safeStorage` 加密路径早已就位。
- 「为你推荐」的说明仍是旧的"挑一个种子仓库找相似"，现在是按整份收藏的画像搜
  未 Star 过的仓库（`similar` 通道保留但界面已不用）。
- 演示路径让人去「发现仓库」找按钮，实际入口在「收藏管理」。

英中两份同步改，避免只改一边造成新的不一致。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R43 · Phase 2/6：主进程签名契约里一批过期的"落地状态"（优先级 6）
done · commit 24c908a

`docs/module-signatures.md` 被各处源码注释当作冻结契约引用，但里面残留着 Phase 0
骨架期的断言，其中几条**与现在的实现相反**，最有代表性的是 local.ts 那三行：

    在取消克隆那个 PR 落地之前，现有实现只会返回路径、从不返回 null
    （落地状态：Phase 0 的 cancelClone 是恒返回 false 的桩。）

实际（src/main/local.ts:230）`cancelClone` 按 fullName 查 AbortController，有就
`abort()` 并返回 true；`false` 只表示"那一刻没人在跑"，是正常竞态。`clone` 取消时
返回 null 也已落地。照这段契约读代码的人会以为取消克隆没人实现，从而绕开
`cancelClone` 自己造一套——这是文档比没有更坏的典型。

同批修正：
- ai.ts / config.ts：两处"Phase 0 只有桩""覆盖层待落地"已不成立；
- ai-prompts.ts / recommend.ts：导出面缺了一整批已实现的函数与常量；
- report.ts：补上"日历周 vs 滚动 7 天"两个窗口的说明（同页两个"周"不同窗）；
- tracker.ts：点明真实模式下两个导出都抛 NOT_IMPLEMENTED；
- store.ts：补 `getAiKey` 条目，并写明 `AiConfigView` 没有 apiKey 是**有意的**
  （不让明文回传这件事由类型保证，而不是靠调用方自觉）。

签名一个字没改，改的只是"当前实现到哪一步"的叙述。

验证：tsc 干净、eslint 干净、npm run build 通过（纯文档改动）。

## R44 · Phase 2：本地标记没落盘 ≠ Fork / Clone 失败（优先级 5）
done · commit de10c28

R37 修的是主进程那一侧：Star 已在 GitHub 上成立、只是本地写盘失败时，不再报成
"Star 失败"。渲染进程这侧还有同样两处没修——`repoStore.fork` 与 `repoStore.clone`
都是

    await unwrap(window.api.store.updateLocalState(...))   // 把标记写进库文件

这一句失败时 unwrap 会弹一条光秃秃的报错 toast，用户看到的就是"Fork 失败""克隆失败"。
可事实是 fork 已经在你账号下建出来了（主进程调的是 createFork）、目录已经躺在磁盘上
了。这不是没成，只是本机没记住。区别很要紧：报成失败会诱发用户再点一次，甚至怀疑
fork 根本没建。

- 新增模块级 `persistLocalState()`：不抛错，成功返回 null、失败返回错误文案，
  与主进程 index.ts 的 errText 是同一个思路。
- fork：内存态保持已 Fork（此刻它是真的），提示改成把后果说清——标记没落盘、重启
  后就没了，并给一条真能走的补救路径（重启后按钮回到「Fork」，再点一次即可；
  对已 fork 的仓库 GitHub 返回的是同一个 fork，不会重复建）。
- clone：**刻意不更新内存态**。假装已克隆的话，「打开目录」能用、「删除本地副本」
  却因为主进程没有记录必然失败，那一行就成了半真半假的状态。保持未克隆 + 把后果
  说全（目录在哪、应用不知道它存在、要接管就先手动删掉再 Clone）。这一条比 fork
  严重：主进程的磁盘对账的数据源正是这份记录，记录没写进去，对账也救不回这个目录。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R45 · Phase 2+5：Star 列表在 300 条处静默截断（截断被当成"就这么多"）
done · commit 7aad97f

`github.fetchStarred` 的分页上限是 `MAX_PAGES = 3`（=300 条），依据是注释里写的
"首页加载不能被无限翻页拖死"。**那条理由不成立**：首屏读的是本地库
（store.getRepos），fetchStarred 只在用户点「从 GitHub 同步」和设置页「测试连接」
时被调用，两次都是显式动作。而 300 这个上限的代价是实打实的：

  ① 收藏超过 300 个的人同步拿到的是截断列表，界面那句"已从 GitHub 同步 300 个仓库"
     看不出它是截断的——又一次把"没读全"说成"就这么多"；
  ② 更糟的是 renderer 的 mergeRepos **以远端为基准**，第 300 名之外的仓库会被判定
     为"已经不在 GitHub 上了"而从本地列表里删掉，连它们的 cloned_path /
     forked_full_name 一起丢。主进程磁盘对账的数据源正是这份记录，所以那个孤儿目录
     也救不回来——这是真的数据丢失，只是没人会立刻发现。

修法不是加逻辑而是松阀门：循环里本来就写着"不满一页就 break"，只要上限不再比真实
收藏数小就能读全。3 → 20 页（2000 条），最坏 20 次串行请求，对一次显式同步可接受。
撞上阀门时仍会截断（`Promise<Repo[]>` 被契约冻结成一个纯数组，没有"还有更多"的位置
可放），所以命中时补一条明确的 warn，不让它悄悄发生。

新增 `scripts/selfcheck/github-paging.mjs`（+ `github-paging-entry.ts`）：真实模式 +
打桩 globalThis.fetch（Octokit 走的就是它），断言 450 条能全部读到、按 1..5 顺序翻页、
正好 300 条时会多探一页确认到底、空收藏只请求一次、没有 token 时不发请求且报可读错、
撞上限时返回 2000 条且留下 warn、401 翻成人话，并且第一条就钉死"必须跑在真实模式"
（跑成 mock 的话分页分支根本不执行，其余断言会假绿）。

**反向探针实测**（记忆里那条教训：照抄很容易，要正反向都验）：把 MAX_PAGES 改回 3
后，前三条断言如期变红（只读到 300 条、只翻了 1,2,3），确认它们真的钉住了这次修的
东西，而不是恰好通过；改回 20 后全绿。

验证：tsc 干净、eslint 干净、npm run build 通过；github-paging 与
recommend-search（同样 import github.ts）全绿。

## R46 · Phase 2：保存 Token 失败却清空输入框 = 谎报成功（优先级 5）

设置页的 `save()` 在 `await saveToken(...)` 之后无条件 `setToken('')`。而**清空输入框
本身就是一句"成了"**：保存失败时（写盘出错、无内存后端且写库失败）照样清空，用户刚
粘进去的那串 token 就没了，界面跟成功长得一模一样——只能回去再拷一次。这是本轮一直在
收的那一类「把没成说成成了」的镜像版：**把一个动作的"收尾动作"当成成功信号**，
在结果还没被确认时就替用户宣布了成功。

`saveToken` 原来的签名 `Promise<void>` 根本没有位置传回这个结果，所以实现里只能
`try/catch` 掉错误字段 + toast。改成 `Promise<boolean>`（**这一次到底存进去了没有**），
失败仍然不抛错——toast 由 `unwrap` 弹、`error` 字段由 store 写——只是把结果交给
唯一调用方。注释里明写它为什么要有返回值，免得后来者"顺手"改回 void。

调用点：`Settings.tsx` 的 `save()` 改成 `const saved = await saveToken(trimmed); if (saved) setToken('')`。
失败时留着原文，改完再点一次即可；到底是成是败由 toast 与状态徽章说，不再由清空动作替
用户下结论。与 `reloadAiConfig()` 用返回值区分「保存成功」和「随后读状态失败」是同一条
约定（R41 那批）。

契约同步：`docs/renderer-contracts.md` 的 `saveToken(token: string): Promise<boolean>;`
加了一行说明这次改动与理由（该文件明写"新增成员允许、签名不得改"，所以变更点必须留痕）。

验证：tsc 干净、eslint 干净、npm run build 通过。改动前先 grep 确认全仓库只有
`Settings.tsx` 一个调用点，因此签名的破坏面是 1，不可能漏改（也是这次敢动签名的前提）。

## R47 · Phase 2+6：src/main/index.ts 里两处「Phase 0 的注释」在说谎（优先级 6）

`index.ts` 是全局唯一的 IPC 接线表，读代码的人从它出发去理解每个通道。它里面两条注释
停在骨架期、实现落地后没跟着改，于是**注释与代码相反**：

1. `LOCAL_CANCEL_CLONE` 上面写着「Phase 0 占位：local.cancelClone 现在恒返回 false
   （"没有人在跑"），真正的实现在取消克隆那个 PR 里补」。实际上 cancelClone 现在拿着
   AbortController 调 abort，simple-git 在 spawn.before 挂了监听、对 git 子进程发 SIGINT，
   真的会中止；`false` 有精确含义（那一刻没人在跑）。
2. `ai.refreshAiConfigCache()` 上面写着「Phase 0 里这是个空函数（见 ai.ts 的说明），
   调用点先钉在这里」。实际上它已经会读 store、把 key / baseUrl / model 灌进 config.ts
   的覆盖层——**「保存后立即生效、无需重启」这句话成不成立，全看它**。

这类缺陷的危害与 R43 修掉的 `docs/module-signatures.md` 那三行完全同构，而且更近一层：
文档里的错话读者还会存疑，源码注释里的错话通常被直接当作事实。具体后果是引导性的——
① 以为取消是空操作，于是在 UI 上不给取消入口，或者自己另造一套中止逻辑；
② 排查「配了 key 却没生效」时，第一个就把预热这条路径排除掉。

两处都改成描述现状（含关键机制的一句话，读者不必再跳文件），并各留一句 ⚠️ 说明原来
错在哪、错的是哪一类，免得下次实现变更时又把它落在这里。纯注释改动，不动任何行为。

验证：tsc 干净、eslint 干净、npm run build 通过。

## R48 · Phase 2+5：Token 解密失败被说成「未配置」（优先级 5）

`store.getToken()` 在 safeStorage 解不开密文时（换机器 / 系统密钥环变更）降级返回 null，
这是**它那一侧**的取舍：它唯一的调用方 `github.client()` 只关心"发不发得出请求"，
①「本来就没配过」和 ②「配过但读不出来」对它没有区别（注释里那段降级说明也是这么写的）。

但 `hasToken()` 是**另一个问题**：「用户到底配过没有」。它当时写的是
`return memoryToken !== null || (await getToken()) !== null` ——于是 ② 也被算成 false，
而 false 在设置页的含义是「未配置」。这就是 R33 修掉的那个 Token 徽章谎话的**另一条路径**：
R33 只覆盖了"读盘失败"（hasToken 抛错 → 渲染进程 null → 「读不到」），
解密失败走的是"静默返回 false"，一模一样地装成了「未配置」。用户会以为自己从没配过，
真正的原因（密钥环变了）从头到尾没被说出来。

修法刻意**不动任何签名**：`hasToken()` 本来就有抛错路径（读盘失败走 fail()），
渲染进程那套三态徽章也早就接住了 —— IPC 包装器把抛错变成 `{ ok: false }`，
渲染进程的 hasToken() 返回 null，设置页显示「读不到」+ 写明原因的红 toast + 重试按钮。
所以只需要：getToken() 给 null 之后再确认一次磁盘上到底有没有那条记录，
有就抛一条能指导下一步的错误（消息刻意在 try 外面抛，不被 fail() 再包一层，
与 saveToken 拒绝空 token 同一个手法）。

`getToken()` 保持原样返回 null——**改它会连带改掉"应用能不能启动"这条推理链**，
而且 selfcheck A4 明确钉着它（"解密失败必须降级，不能把应用搞崩"）。这条断言一字未动。

顺带把 `github.client()` 那句「未配置 GitHub Token，请到设置页填入后重试」改成
「没有读到 GitHub Token（未配置，或本地那条记录解不开）」——两种含义都覆盖，
不让"发不出请求"这一步把用户指错方向。错的是措辞，不是行为。

selfcheck **新增**两条断言（已有的 A4 一字未改）：key-B 场景下 hasToken 抛错且消息含
「解不开」；换回 key-A 之后 hasToken 恢复 true。**反向探针实测**：把 `if (stored)`
短路成 `if (stored && false)` 后，新断言如期变红（"没有抛错"），确认它钉住的正是这次改的
东西；恢复后全绿。

验证：tsc 干净、eslint 干净、npm run build 通过；store-local 两个场景（keyring none/available）
全绿。docs/module-signatures.md 的 store 说明补上这条取舍（签名未变，只是把行为和理由写清）。

## R49 · Phase 2：主题「没记住」却照样说自己记住了（优先级 5）

`lib/theme.ts` 的 `persistTheme()` 把 localStorage 写入失败整个吞掉，注释里也认了
——"写不进去也不影响本次会话：state 已经更新，只是下次启动会回到默认"。而设置页的
主题卡片上写的是一句承诺：

  「选择立即生效，并记住你的选择——下次启动会在界面出现之前就应用好，不会先闪一下
    另一个主题。」

存储被禁用（隐私设置）/ 配额满时这句话是假的，而且**没有任何地方告诉用户**：本次会话
主题确实切了，用户看到的是"成功"，直到下次启动莫名其妙翻回上一个主题，才发现它从来没被
记住过。这与 R46 的「保存 Token 失败却清空输入框」是同一条约定——**凡是"记住 / 保存"
这类承诺，都得由写成功来决定，不能由调用方自己假定**；区别只在丢的东西：那边丢的是用户
刚粘进去的 token，这边丢的是用户的一次选择。

修法照 R46 的形状来：`persistTheme()` 返回"写进去了没有"，`applyTheme()` 交给调用方
（签名 void → boolean，唯一调用点是 ThemeCard，已 grep 确认）。卡片用一个 rememberFailed
状态渲染一行说明，并且**说清坏掉的是哪一半**：主题已经切了（本次会话完全正常），
没能记住的只是"下次"；哪次写成功了提示自己就消失。

口径仍是"吞掉报错可以，但事实不能被说反"：不改成抛错——抛了只会让一次点击炸掉，
而主题确实切了；只把这一半的结果说出来。

`docs/renderer-contracts.md` 的主题那一节补上返回值语义（该文件明写行为变更必须同步）。

验证：tsc 干净、eslint 干净、npm run build 通过；grep 确认 applyTheme 只有 ThemeCard
一个调用点。这条路径没有自检可跑（渲染进程无 DOM 环境，localStorage 不可用也没法在
自检里模拟），只能靠类型与人工验收——已在 NIGHT_STATE 里注明。

## R50 · Phase 2：目录选择框还开着时，进度条显示上一次克隆的 100%（优先级 5）

这条是**把原先记在「已知的收尾事项」里的结论推翻了**。原来写的是：

  「`CloneProgressBar` 的进度条在克隆结束后可能停在 100% 不清零。根因是共享类型
    `CloneProgress`（src/shared/types.ts）里没有 `startedAt`，前端分不出"这个 100%
    是刚刚那次"还是"上一次留下的"……契约放开之前不修。」

前半段（现象）对，后半段（根因与修法）是错的。真实的链路是：

- `RepoActions` 用 `pendingAction === 'clone'` 决定挂不挂进度条与「取消克隆」，
  而 `pendingAction` 从**点下按钮那一刻**就有值——那时 `clone()` 正停在原生目录选择框上，
  用户能在里面待几十秒（挑目录、翻文件树、甚至去建一个目录）。
- 这段时间进度条已经挂上并开始轮询，而主进程手里的记录是**上一次**克隆留下的：
  local.ts 刻意在克隆结束后把最后一条记录留着不删，理由也写明了——不让进度条在收尾
  那一刻闪回空白；`clone-progress` 自检把这条钉成了断言（"克隆结束后记录仍在，不闪回 null"
  / "记录停在最后一次上报的值"）。
- 两者一凑，用户看到的是**一条 100% 的满进度 + 上一次的「已用 312s」**，在目录框里
  停留多久就显示多久。它长得和"这次已经跑完了"一模一样，而这次其实还没开始。
  最常撞上的路径：克隆过一次 → 删掉本地副本（或上次失败/取消）→ 再点 Clone。

**不需要前端"分得出那是哪一次"，只要别在错的时候去问** ——这就是被推翻的那句推理。
repoStore 新增 `cloningFullName`：只在 `chooseDir()` 返回之后、`window.api.local.clone()`
发出之前才赋值，IPC 一 settle 就清掉（try/finally）。进度条与「取消克隆」改挂它：
目录框还开着的时候，既没有进度可画、也没有东西可以取消（那时点取消，
主进程的 `cancelClone` 只会回 false —— 也是一句"我没在跑"的实情）。

主进程一个字没动，共享类型没动，被自检钉住的那条取舍继续成立。

验证：tsc 干净、eslint 干净、npm run build 通过。这条路径没有自检可跑（渲染进程无
DOM 环境，且原生目录框无法在自检里模拟），只能靠类型与人工验收——**建议手工过一遍
"克隆 → 删除本地副本 → 再点 Clone"**，目录框里应看不到任何进度条。

## R51 · Phase 2：凭据解不开时登录卡片变成死胡同（优先级 5，修的是 R48 自己带出来的回归）

R48 把 `hasToken()` 改成"密文解不开就抛错"，那在设置页的 Token 徽章上是对的（三态原样
接住，显示「读不到」+ 原因 + 重试）。但同一个 IPC 还有第二个调用方：

  `GithubLoginCard` 的挂载 effect 里，`getState()` 与 `hasToken()` 被同一个 `unwrap`
  包着、同一个 try 兜着 —— 于是 hasToken 一抛，整张卡片切到 `unavailable`，
  文案是「读取登录状态失败，请查看应用日志」，**连登录按钮一起没了**。

两个问题叠在一起：

1. **归错因**：登录状态的读取本身没失败，失败的是"读本机那条凭据"，而且是一条有明确
   病因与明确出路的失败（换机器 / 系统密钥环变更）。
2. **把唯一的出路关掉**：这张卡片恰恰是就地解决问题的入口——重新登录就是写一条新的
   Token 进去，覆盖掉解不开的那条。它把人指向「查看应用日志」，那对一个换机器的人是
   零信息；而真正该点的按钮就长在这张卡片上，被它自己藏了。同时下方「GitHub Token」
   卡片显示的是「读不到 + 重试」，两张卡对同一件事各说各话。

修法：hasToken 单独 catch，只记下原因、视图照常走未登录态，登录按钮留着，原因显示在
按钮上方（指向下面那张能重填的卡片）。登录成功与退出登录各清一次这条告警——那两件事
都真的改写了本机凭据，再挂着就是"记着的旧错"（同 R41 那个 error 短路）。

验证：tsc 干净、eslint 干净、npm run build 通过；`auth` 与 `store-local` 自检全绿
（主进程一个字没动）。这条路径同样没有自检可跑（组件层无 DOM 环境），人工验收路径：
把 `SAFESTORAGE_KEY` 换掉（或换机器）后打开设置页——「GitHub Token」卡片应显示
「读不到」，而**登录卡片仍应显示登录按钮**。
