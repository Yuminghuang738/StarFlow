// ============================================================
// IPC 通道名契约（冻结）
// 冻结契约：不要随意修改本文件。
// ============================================================

export const IPC = {
  // GitHub 读写
  GITHUB_FETCH_STARRED: 'github:fetchStarred',
  GITHUB_FETCH_README: 'github:fetchReadme',
  GITHUB_FETCH_RELEASES: 'github:fetchReleases',
  GITHUB_FETCH_COMMITS: 'github:fetchCommits',
  GITHUB_UNSTAR: 'github:unstar',
  GITHUB_FORK: 'github:fork',
  // 给仓库加 Star（推荐列表里的动作）。与 unstar 对称：「GitHub 上真的加了」和
  // 「本地列表跟着变」都由主进程保证，渲染进程只负责按钮上的忙碌态。
  GITHUB_STAR: 'github:star',

  // 本地 Git
  LOCAL_CHOOSE_DIR: 'local:chooseDir',
  LOCAL_CLONE: 'local:clone',
  LOCAL_OPEN_DIR: 'local:openDir',
  // 克隆进度。单独开一条通道而不是让 clone 自己回报：clone 是一次长驻 invoke，
  // 在它返回之前渲染进程什么也拿不到，而本项目没有 main→renderer 的推送机制。
  LOCAL_CLONE_PROGRESS: 'local:cloneProgress',
  // 删除本地副本。**刻意只收 fullName、绝不收路径**：路径由主进程从自己的 store 里
  // 查出来，渲染进程没有机会把任意路径交给 rm。返回实际被删掉的路径（没删成返回 null）。
  LOCAL_REMOVE_CLONE: 'local:removeClone',
  // 对账：记录里有 cloned_path、磁盘上却没有的，静默清掉记录。返回被清理的 fullName。
  LOCAL_PRUNE_CLONES: 'local:pruneClones',
  // 中止正在进行的克隆。返回 true = 确实有在跑的克隆被中止，false = 本来就没人跑
  // （界面认为在跑、主进程可能已经结束了，那种情况不算错，所以不抛）。中止后目标目录
  // 由主进程在 clone 的 catch 里清掉——cloned_path 压根没写过，对账救不了它。
  LOCAL_CANCEL_CLONE: 'local:cancelClone',

  // AI
  AI_SUMMARIZE: 'ai:summarize',
  AI_CLASSIFY: 'ai:classify',
  AI_ENRICH_REPOS: 'ai:enrichRepos',
  AI_GENERATE_REPORT: 'ai:generateReport',
  // 连接探针。**不能拿 summarize 当探针**——它在失败时静默降级成空串，永远"成功"。
  // 这条走一次极简调用，并把错误分类成人话返回（不抛错）。
  AI_TEST_CONNECTION: 'ai:testConnection',
  // 收藏画像：把渲染进程算好的统计摘要交给模型解读。
  // 入参是**摘要文本**而不是仓库列表——聚合结论只该由本地算出来，模型负责解读、不负责统计。
  // 与探针同理不抛错：失败与「没配 Key」都以 { text: '', hint } 正常返回。
  AI_ANALYZE_COLLECTION: 'ai:analyzeCollection',

  // 存储
  STORE_GET_REPOS: 'store:getRepos',
  STORE_SAVE_REPOS: 'store:saveRepos',
  STORE_SAVE_TOKEN: 'store:saveToken',
  STORE_HAS_TOKEN: 'store:hasToken',
  STORE_UPDATE_LOCAL_STATE: 'store:updateLocalState',
  STORE_CLEAR_TOKEN: 'store:clearToken',

  // AI 配置 —— 与上面 token 三件套刻意对称：存储与加密都落在 store.ts，
  // 所以归 store 命名空间而不是 ai。密钥**只进不出**，没有任何一条通道会回传明文
  // （视图类型 AiConfigView 里就没有 apiKey 字段，这是契约层面的保证）。
  STORE_GET_AI_CONFIG: 'store:getAiConfig',
  STORE_SAVE_AI_CONFIG: 'store:saveAiConfig',
  STORE_CLEAR_AI_KEY: 'store:clearAiKey',

  // 周报
  REPORT_GENERATE: 'report:generate',

  // 推荐
  RECOMMEND_SIMILAR: 'recommend:similar',
  // 「一句话找仓库」。**刻意不暴露 github:searchRepos**：界面只需要"推荐/猜你喜欢/
  // Star"三个动作，加一条没有消费者的通道纯粹是扩大表面积。AI 的搜索计划也只活在
  // 主进程内部，不跨进程传输。
  RECOMMEND_FOR_QUERY: 'recommend:forQuery',

  // 定时追踪
  TRACKER_START: 'tracker:start',
  TRACKER_STOP: 'tracker:stop',

  // 登录（GitHub OAuth Device Flow）
  AUTH_GET_STATE: 'auth:getState',
  AUTH_START_DEVICE_FLOW: 'auth:startDeviceFlow',
  AUTH_WAIT_FOR_LOGIN: 'auth:waitForLogin',
  AUTH_CANCEL_DEVICE_FLOW: 'auth:cancelDeviceFlow',

  // 无边框窗口控制
  // 窗口本身没有"查 event.sender"的机会：handle() 包装器会主动丢弃第一个 event 参数，
  // 所以主进程维护一个模块级的当前窗口引用，这几个 handler 都对着它操作。
  WINDOW_MINIMIZE: 'window:minimize',
  // 返回**切换之后**的状态（true = 现在是最大化）。必须返回：本项目没有 main→renderer
  // 推送，图标只能靠"点击时用返回值权威更新"+"window.resize 兜底查询"两招来同步。
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggleMaximize',
  WINDOW_CLOSE: 'window:close',
  // resize 兜底：窗口被 WM 的快捷键 / 拖拽吸附改变时，点击路径是察觉不到的
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
