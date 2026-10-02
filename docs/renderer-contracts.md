# 渲染进程契约（冻结）

> Dashboard 页与 App/Report/store 之间的接口。骨架阶段已给出可用实现，
> 渲染进程公共层负责加固，业务页面直接消费。
>
> **已有成员的签名不得修改**；新增成员是允许的（消费方需要新数据时不必改契约），
> 但**必须同步更新本文件**，否则这里就会慢慢变成一份谎话。下面的 RepoStore 已经
> 补齐了实际存在于代码中的成员。

## src/renderer/src/store/repoStore.ts
export interface RepoFilters {
  keyword: string;
  language: string | null;
  category: AiCategory | null;
  onlyCloned: boolean;
}

export interface RepoStore {
  repos: Repo[];
  loading: boolean;
  filters: RepoFilters;
  // —— 后加的非契约成员：加载态与错误。error 只在加载失败时写入，不清空 repos ——
  enriching: boolean;
  error: string | null;
  visibleRepos(): Repo[];
  setFilters(patch: Partial<RepoFilters>): void;
  load(): Promise<void>;
  // —— 错误字段是两个，别混用 ——
  // error：最近一次**任何**操作的失败原文（star / clone / saveToken 也会写），供排查用
  // loadError：**只有 load() 会写**，表示"读取收藏列表这一次"的结果。
  //   页面的空态分叉（"读失败"还是"确实没有"）必须读它——读 error 会把
  //   一次 Star 失败渲染成「读取本地数据失败，本地数据都在」
  error: string | null;
  loadError: string | null;
  refreshFromGitHub(): Promise<void>;
  enrich(): Promise<void>;
  unstar(fullName: string): Promise<void>;
  fork(fullName: string): Promise<void>;
  // star 与 unstar 对称，但落在同一个 store：Star 完管理页/总览/周报用的都是这一个
  // 数组，放别处会出现"推荐页说已 Star、管理页没有它"。内部对已存在的 full_name 去重
  // （GitHub 的 Star 幂等，连点两次会走两次成功分支）。
  star(fullName: string): Promise<void>;
  clone(fullName: string): Promise<void>;
  openDir(path: string): Promise<void>;
  // —— 本地副本管理：load() 末尾会静默调一次 pruneLocalClones 做磁盘对账 ——
  removeLocal(fullName: string): Promise<void>;
  pruneLocalClones(): Promise<void>;
  // —— 取消克隆（取消克隆 PR 落地）：必须裸调 window.api，不能走 unwrap() ——
  cancelClone(fullName: string): Promise<void>;
  // cloningFullName：**真的在跑**克隆的那个仓库（null = 没有在跑）。进度条与
  //   「取消克隆」按钮挂它，不挂 RepoActions 自己的 pendingAction——后者从点下按钮
  //   就有值，而那时用户还在目录选择框里，主进程的进度记录仍是**上一次**留下的
  //   那条 100%（local.ts 刻意保留，见 clone-progress 自检），挂上去会显示一条
  //   满进度 + 上一次的「已用 Ns」，像"这次已经跑完了"。
  cloningFullName: string | null;
  // —— token：hasToken/saveToken 供设置页使用 ——
  // hasToken 返回 null 表示「这一次没读到」，与 false（确实没配置）是两回事，
  // 页面必须分开显示，否则一次读取失败会装成「未配置」
  hasToken(): Promise<boolean | null>;
  // saveToken 返回「这一次到底存进去了没有」（原为 Promise<void>，2026-10 改为 boolean）。
  // 失败仍然不抛错（toast 由 unwrap 弹），但设置页要拿它决定**能不能清空输入框**——
  // 清空是一句"成了"，保存失败时照样清空就等于把用户刚粘进来的 token 扔掉。
  saveToken(token: string): Promise<boolean>;
  // —— AI 补全进度（非契约成员）——
  // null = 没有一批在跑（也含"还没问到"）。订阅**这个字段本身**，绝不订阅
  // `{done,total}` 这种临时对象——zustand v5 严格比较快照，每次新对象会无限重渲染。
  // total === 0 表示总数还未知（不是"0 个仓库"）。跑完置回 null，不留 100% 残影。
  enrichProgress: AiEnrichProgress | null;
  // —— 本地副本「落后上游多少 + 更新」（非契约成员；结果只在内存，不落盘）——
  // syncByRepo：full_name -> 最近一次检查结果。**键不存在 = 未检查**，这是"未检查"的
  //   唯一真相来源（重启后必然全部回到未检查）。刻意不进 LocalState、不写库：落后数是
  //   "截至上次抓取"的瞬时事实，落盘后重启会拿它冒充此刻的事实。
  //   ⚠️ 行内组件按**单个键**订阅（s.syncByRepo[full_name]），拿到的是稳定引用；
  //   订阅整个 Record 或 visibleRepos() 会踩 zustand v5 的新对象陷阱。
  // syncingAll：整批检查进行中（自动检查与手动「检查更新」共用）。
  // syncCheckedAt：本会话最近一次**成功**检查的时刻，null = 从未查过；**只用于**进页面
  //   自动检查的节流（同一会话 20s 内不重复打整批 fetch）。检查失败时刻意不写它——
  //   写下去就等于把一次失败当成"刚查过"。
  // updatingFullNames / updatingAll：「更新全部」进行中时单行按钮本就禁用，
  //   store 里再各兜一层，避免并发改同一批仓库。
  syncByRepo: Record<string, LocalSyncStatus>;
  syncingAll: boolean;
  syncCheckedAt: number | null;
  updatingFullNames: Record<string, boolean>;
  updatingAll: boolean;
  checkAllLocalSync(): Promise<void>;
  updateLocal(fullName: string): Promise<void>;
  updateAllLocal(): Promise<void>;
}

export const useRepoStore: UseBoundStore<StoreApi<RepoStore>>;

## src/renderer/src/lib/api.ts
export function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T>
// 把 { ok: false } 转成 toast + throw Error(error)，调用方可以 try/catch

## src/renderer/src/components/common/ConfirmDialog.tsx
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element

## src/renderer/src/components/common/Toast.tsx
export interface ToastItem { id: string; type: 'success' | 'error'; message: string }
export function ToastProvider(props: { children: React.ReactNode }): JSX.Element
export function useToast(): { push(t: { type: 'success' | 'error'; message: string }): void }

## src/renderer/src/components/layout/TitleBar.tsx
export function TitleBar(): JSX.Element

自绘标题栏。主进程的 BrowserWindow 是 `frame: false`，原生标题栏和默认菜单
（`Menu.setApplicationMenu(null)`）都没了，关闭/最小化/最大化只能由这里调
`window.api.window.*` 完成。

三条必须记住的：

1. **拖拽区会吞掉鼠标事件**，所以根元素上的 `.app-region-drag` 区域里，每一个按钮 / 输入框
   都必须显式加 `.app-region-no-drag`，否则点不动。这两个类定义在 `index.css` 的
   `@layer components` 里——不能写内联样式，React 的 `CSSProperties` 里没有
   `WebkitAppRegion`。
2. **本项目没有 main→renderer 推送**，所以最大化图标只有两条同步路径：点击时用
   `WINDOW_TOGGLE_MAXIMIZE` 的**返回值**权威更新（不要自己取反）；兜底是监听 DOM 的
   `window.resize`（最大化/还原/全屏都会触发），debounce 后查 `WINDOW_IS_MAXIMIZED`，
   覆盖键盘快捷键和窗口管理器造成的改变。用 `key={...}` 重挂载之类的办法都不需要。
3. 窗口操作一律**裸调、失败只记日志**，不走 `unwrap()`：窗口已被 WM 关掉、用户连点两次
   关闭，都不是需要告诉用户的错误。

⚠️ 已知的 Linux 落差：Electron 让无边框窗口保留边缘拖拽缩放的 `thickFrame` 是 win32 专属，
Linux 没有对应物；`roundedCorners` 在 Linux 上还依赖桌面环境是否支持客户端装饰。
所以 Fedora 上很可能既没有阴影圆角、也拖不动窗口边缘。真拖不动的话要补 8 条自绘缩放热区，
那需要多开一条 `window:setBounds`（通道数 39 → 40）。

## src/renderer/src/App.tsx —— 页面保活

三个页面（Dashboard / Report / Settings）**首次访问之后不再卸载**，切 tab 只是给它加
`hidden`（`display: none`）。Dashboard 是首屏，一开始就挂载。

为什么不是条件渲染：切一次 tab 就整个重挂，代价是两条真实的用户可见 bug——
**周报生成到一半切走，`await` 回来时组件已经不在，跑了半天的结果被整个丢弃**；
**克隆进行中切走，`RepoActions` 的 `pendingAction` 跟着重置，进度条和「克隆中」一起消失**
（克隆本身在主进程里跑，不受影响，丢的只是界面状态）。

三条不能改的地方：

1. **首次访问才挂载**。一开始把三页全挂上，Report / Settings 的 effect 会在启动时白跑一遍，
   而且 echarts 会在 0×0 的容器里初始化。
2. **渲染用的是派生值，不是 state 本身**。把"记下新 tab"只交给 `useEffect`，新页面会先渲染
   一帧空、effect 跑完才出现，肉眼能看见闪一下。
3. **不要换用 React 的 `<Activity>`**：它的 hidden 模式会清掉副作用，正好会掐断
   `CloneProgressBar` 的轮询——那恰恰是这个改动要保住的东西。

`display: none` 不会让图表画成空白：`echarts-for-react` 用 `size-sensor` 监听容器，
它优先用 `ResizeObserver`，容器从 0×0 变回正常尺寸时会自动 `resize()`。

⚠️ **对页面切换动效的硬约束**：正因为页面不能卸载，**页面级过渡不能用
`AnimatePresence mode="wait"` + `motion.div key={tab}`**（那套的前提就是出场动画播完即卸载）。
要做只能做"进入"方向的动效，或者改用纯 CSS 过渡。这条是给界面重做那个 PR 的。

## 主题偏好：渲染进程唯一的本地持久化例外

主题选择（`light` / `dark` / `system`）存在 **localStorage** 的 `starflow:theme` 键里，
**不走 IPC、不进 lowdb**。这是 `src/` 里第一处也是唯一一处本地持久化，理由是硬的：

- 主题必须在**第一次绘制之前**就确定。走 IPC + lowdb 是异步往返，必然先渲染默认主题再翻面，
  闪一下；而且即使存了 lowdb，也仍然需要一份 localStorage 镜像给 `index.html` 里的
  内联防闪脚本读，那就有两个真值来源。
- 防闪脚本写在 `renderer/index.html` 的 `<head>` 里（CSS 和 React 都还没执行的唯一时机），
  读 localStorage → 没有值就按 light → 翻 `<html>` 上的 `dark` class。**必须 try/catch**：
  localStorage 在某些隐私设置下会直接抛错，抛了就是白屏。

eslint 不禁止 localStorage（`no-restricted-globals` 只拦 `process`/`require`/`__dirname`/
`__filename`/`Buffer`）。除此之外，渲染进程的持久化一律走 IPC。

`applyTheme(choice)` 返回**「这一次到底记进本机了没有」**（2026-10 从 `void` 改为 `boolean`）。
写不进去时主题**照样切换**——两个结果都只影响下次启动，所以不能整个报成失败；但设置页
的主题卡片上写着「并记住你的选择」，静默失败就等于让界面替用户宣布一件没发生的事，
卡片据此把那句话收回去（与 `saveToken` 返回 boolean 是同一条约定）。

## src/renderer/src/components/layout/NavContext.tsx

export function NavProvider(props: { goTo(tab: AppTab): void; current: AppTab; children }): JSX.Element
export function useNav(): { goTo(tab: AppTab): void; current: AppTab }

`current`（当前激活的板块）是**后加的**：页面保活、切走只是 `display:none`，组件自己
察觉不到"我又被看见了"，而 tab 状态本来就握在 `App.tsx` 手里。放进这个已有的上下文，
比给页面加 props（会破坏保活所依赖的 `{ key, render }` 结构）或把 tab 搬进 zustand
（tab 与 visited 是一对必须同步更新的本地状态，拆开更容易不一致）都更小。

两个必须记住的点：

1. **`useNav()` 取不到上下文就抛错**，不返回空实现——静默失败的按钮（点了没反应也不报错）
   是最难查的一类问题。它只在 `NavProvider` 内可用，所以**只有页面级组件能调**。
2. **判断"进入某页"必须用 ref 做进入沿**（`Manage.tsx` 与 `Overview.tsx` 是两处范例）：
   直接对 `current` 写 effect 会在每次 `current` 变化时都跑一遍；而且 StrictMode 下
   effect 双跑，只有"上一次的值"存在 ref 里才能吸收掉。离开沿同理（见下面的筛选清除）。

## src/renderer/src/components/auth/useGithubAuth.ts

export type GithubAuthView = 'loading' | 'unavailable' | 'idle' | 'waiting' | 'loggedIn'
export interface GithubAuth { view; reason; tokenError; pending; user; viewer; viewerError; busy;
  deadline; now; start(); cancel(); logout(); copyCode(); refresh() }
export function useGithubAuth(): GithubAuth

设备流登录的**无头状态机**，从 `GithubLoginCard` 里原样搬出来的（那批注释一并搬）。
抽出来的理由：侧边栏的账号块要能就地登录 / 退出，而设置页那张卡片已有一套完整实现；
两份实现会各养一套坑——「不能把 15 分钟的 `waitForLogin` await 在事件处理里」
「挂载时要接回主进程里还挂着的 pending」「打包后 `file://` 下 `navigator.clipboard`
可能是 undefined」——修了一处另一处照旧，正是最难查的那种 bug。

`listeners` 是一张**进程内广播表**：设置页的卡片与侧边栏的账号块**同时存在**
（页面保活），一边登录 / 退出之后另一边照旧显示旧状态的话，界面上会同时出现
「未登录」和「已登录 @xxx」。登录成功与退出后各广播一次，两边**重新问主进程**——
主进程才是权威，不让两个实例互相传话。

两个字段别混：`viewerError` 是 `auth.getUser` 这条**通道本身**失败（IPC 故障），
`viewer.reason === 'error' | 'unavailable'` 是通道通了但没拿到。两者的措辞不同。

## src/renderer/src/components/layout/AccountPanel.tsx

export function AccountPanel(): JSX.Element

侧边栏底部的账号块（替换掉原来的 v0.1.0 / Hackathon Build 卡片），点击弹出向上
（`bottom-full`）的面板：就地登录 / 退出登录 / 复制设备码 / 跳设置页。它消费的正是
上面那个 hook。`unavailable`（没配 Client ID 或 Mock 模式）时显示原因 + 「去设置」，
**不显示登录按钮**——一个点了必然失败的按钮比没有按钮更糟。

⚠️ 头像用的是 `renderAvatar()` **普通函数**而不是内层组件：内层组件每次渲染都是新的
组件类型，React 会整棵重挂，等待授权倒计时每秒跳一次时头像会被反复重挂、
`onError` 回退状态随之丢失。要用普通函数调用（`{renderAvatar()}`），不要写成 `<Avatar />`。

## src/renderer/src/lib/enrichLabel.ts

export function enrichButtonLabel(progress: AiEnrichProgress | null): string

「AI 补全分类」按钮在跑的时候显示什么，`Manage` 与 `Settings` **共用**：这是给用户看的
一句话，两处措辞必须一致（同一个功能在两个页面上叫两个名字，用户会以为它们是两件事）。
`total === 0`（总数还未知）或 `progress === null` → 「补全中…」，**不拿 0 冒充进度**；
否则 `补全中 done/total`。**不显示百分比**：百分比是 done/total 的派生品，多一层换算
就多一处能算错的地方。

## src/renderer/src/pages/Logs.tsx

export function Logs(): JSX.Element

「运行日志」页，放在设置与每周回顾之间。消费 `log:tail` / `log:clear` 两条通道
（主进程侧是 `logBuffer.ts`，见 module-signatures.md）。

- **只在页面可见时轮询**（`useNav().current === 'logs'`，间隔 1200ms；`inFlightRef`
  做单飞防叠）。页面保活，不停的话会一直白问。
- 轮询用**裸调 `window.api.log.tail()` + 自己判 `res.ok`**，不走 `unwrap()`：
  这是按秒跑的，通道抖一下不该弹一条红 toast。读失败时页面内联显示一条说明，
  **并注明下面这份列表是上一次成功读到的快照**——不让人以为看到的就是此刻的日志。
- `dropped > 0` 时页头显示「共 N 条 · 已丢弃 D」；自动滚动只在用户本来就在底部时生效
  （`onListScroll`，24px 阈值），否则每来一条就把人拽回底部。清空走 `ConfirmDialog danger`。

## 页面级自动行为（本次新增，全是"保活页面"带来的坑）

页面保活 = 切 tab 不卸载，凡是"进入该页做一次"或"离开该页要还原"的行为，都不能靠
挂载/卸载，只能靠 `useNav().current` 的**进入沿 / 离开沿**。

- **收藏总览·AI 收藏画像自动生成**（`Overview.tsx`）：进入该板块、且列表非空时自动生成，
  不需要用户点「生成画像」。它不是进入沿驱动，而是 `[current, repos]` 驱动的**幂等决策**：
  DEFAULT_TAB 就是总览、而 repos 在挂载后才异步到达，纯进入沿在首次启动时永远不会触发。
  幂等靠三样东西——摘要 digest（只含日历日期，同一天内稳定）、`lastAttemptRef` 的
  上次尝试时刻（失败 / 无 key 后 60s 内不重试，避免反复计费）、`analysisBusyRef` 单飞。
  数据没变且已有结果就直接返回，所以来回切 tab 不会重复请求。手动按钮保留为快捷方式
  （文案在 `生成画像` / `重新生成` / `生成中…` 之间切换）。**旧行为是纯手动**，
  代码里那句「刻意不做进页面就自动生成」已经不成立。
- **收藏管理·离开即清筛选**（`Manage.tsx`）：从总览图表下钻进来会带着筛选（语言 / 分类），
  这是想要的；但切到别的板块再回来时必须是**全量**。做法是在**离开沿**（`justLeft`）
  把 `filters` 与 `DEFAULT_FILTERS` 逐键比对，脏了才 `setFilters({ ...DEFAULT_FILTERS })`
  ——**传拷贝，绝不把常量本身塞进 store**（那会让后续 `setFilters` 原地污染常量），
  并且 `return` 掉、不走后面的进入沿逻辑（否则刚清完又触发一次自动检查，白打一批 fetch）。
  总览→管理是进入沿而非离开沿，所以清筛选**不会**误伤下钻带过来的筛选。
- **发现仓库·清空搜索框即清结果**（`Discover.tsx` + `FilterBar.tsx`）：输入框为空
  （含只剩空白）时结果区与状态行必须什么都不显示。两条路径都要堵：
  ① 输入变化时立刻 `resetSearch()`（请求序号 +1，作废在飞的搜索）——否则清空后
  前一次的响应回来会把结果填回一个已经空着的输入框下面；
  ② `FilterBar`（收藏管理的筛选栏）在**离开该页**时把本地关键词状态与
  `lastPushedKeyword` 一起复位，否则 200ms 的防抖会在离开后补写一次，
  把刚清掉的筛选又写回去。

## 渲染进程的测试盲区（没有 DOM 测试环境）

`scripts/selfcheck/` 全是 Node 侧的自检。渲染进程**没有 DOM 测试环境**，SSR 也只读
`getInitialState`，所以下面这些只能**人工验收**（`! npm run dev`，GUI 需要你自己的终端）：

- store 里的编排与汇总文案：`updateAllLocal()` 的那条「X 已更新 / Y 已是最新 / Z 跳过 /
  W 失败」逐项报账 toast、`updateLocal()` 的 refused-* 措辞、`enrich()` 的进度轮询；
- 卡片 / 徽章 / toast 的实际渲染（`SyncBadge` 的各种 state、`AccountPanel` 的弹出面板、
  `Logs` 的滚动行为）；
- 上面那三条"进入沿 / 离开沿"行为。

**改这些地方时不能拿"自检全绿"当验收**——自检覆盖不到它们。这是本仓库既有的盲区，
本次改动没有（也不会顺手）改变这一点。
