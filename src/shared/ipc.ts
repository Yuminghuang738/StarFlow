// ============================================================
// IPC 通道名契约（冻结）
// 只有集成工程师（P7）可以修改本文件。
// ============================================================

export const IPC = {
  // GitHub 读写 —— 负责人 P1
  GITHUB_FETCH_STARRED: 'github:fetchStarred',
  GITHUB_FETCH_README: 'github:fetchReadme',
  GITHUB_FETCH_RELEASES: 'github:fetchReleases',
  GITHUB_FETCH_COMMITS: 'github:fetchCommits',
  GITHUB_UNSTAR: 'github:unstar',
  GITHUB_FORK: 'github:fork',

  // 本地 Git —— 负责人 P3
  LOCAL_CHOOSE_DIR: 'local:chooseDir',
  LOCAL_CLONE: 'local:clone',
  LOCAL_OPEN_DIR: 'local:openDir',

  // AI —— 负责人 P2
  AI_SUMMARIZE: 'ai:summarize',
  AI_CLASSIFY: 'ai:classify',
  AI_ENRICH_REPOS: 'ai:enrichRepos',
  AI_GENERATE_REPORT: 'ai:generateReport',

  // 存储 —— 负责人 P3
  STORE_GET_REPOS: 'store:getRepos',
  STORE_SAVE_REPOS: 'store:saveRepos',
  STORE_SAVE_TOKEN: 'store:saveToken',
  STORE_HAS_TOKEN: 'store:hasToken',
  STORE_UPDATE_LOCAL_STATE: 'store:updateLocalState',
  STORE_CLEAR_TOKEN: 'store:clearToken',

  // 周报 —— 负责人 P4
  REPORT_GENERATE: 'report:generate',

  // 推荐 —— 负责人 P4
  RECOMMEND_SIMILAR: 'recommend:similar',

  // 定时追踪 —— 负责人 P4
  TRACKER_START: 'tracker:start',
  TRACKER_STOP: 'tracker:stop',

  // 登录（GitHub OAuth Device Flow）—— 负责人 P7
  AUTH_GET_STATE: 'auth:getState',
  AUTH_START_DEVICE_FLOW: 'auth:startDeviceFlow',
  AUTH_WAIT_FOR_LOGIN: 'auth:waitForLogin',
  AUTH_CANCEL_DEVICE_FLOW: 'auth:cancelDeviceFlow',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
