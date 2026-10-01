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
  clone(fullName: string): Promise<void>;
  openDir(path: string): Promise<void>;
  // —— 本地副本管理：load() 末尾会静默调一次 pruneLocalClones 做磁盘对账 ——
  removeLocal(fullName: string): Promise<void>;
  pruneLocalClones(): Promise<void>;
  // —— 取消克隆（取消克隆 PR 落地）：必须裸调 window.api，不能走 unwrap() ——
  cancelClone(fullName: string): Promise<void>;
  // —— token：hasToken/saveToken 供设置页使用 ——
  // hasToken 返回 null 表示「这一次没读到」，与 false（确实没配置）是两回事，
  // 页面必须分开显示，否则一次读取失败会装成「未配置」
  hasToken(): Promise<boolean | null>;
  // saveToken 返回「这一次到底存进去了没有」（原为 Promise<void>，2026-10 改为 boolean）。
  // 失败仍然不抛错（toast 由 unwrap 弹），但设置页要拿它决定**能不能清空输入框**——
  // 清空是一句"成了"，保存失败时照样清空就等于把用户刚粘进来的 token 扔掉。
  saveToken(token: string): Promise<boolean>;
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
