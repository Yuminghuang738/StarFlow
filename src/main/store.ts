// 数据落盘位置：app.getPath('userData')/starflow.db.json
// mock 模式单独用一个库文件，避免演示数据和真实数据互相污染。

import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { app, safeStorage } from 'electron'
import type { Low } from 'lowdb'
import { JSONFilePreset } from 'lowdb/node'
import type { Repo, LocalState, AiConfigView, AiConfigPatch } from '@shared/types'
import { isMockMode } from './config'
import { mockStarred } from './mock'

interface DbSchema {
  repos: Repo[]
  token: string | null
}

/**
 * 历史上无加密后端时明文落盘用的标记，现在只剩「读」这一处引用。
 *
 * 结论（issue #9 决议 (c)、issue #12）：无加密后端时 token 一律不落盘，所以不再有写入方。
 * 保留它是为了兼容别人机器上遗留的 'PLAIN:xxx' 旧数据——按前缀判断而不是看
 * isEncryptionAvailable()，换机器之后加密后端可能又可用了，但文件里躺着的仍是明文，
 * 用后端能力判断会读错。
 */
const PLAIN_PREFIX = 'PLAIN:'

// 模块级缓存：lowdb 的实例要复用，否则并发调用会各自读一遍文件
let dbPromise: Promise<Low<DbSchema>> | null = null

// 无加密后端（例如没装 keyring 的 Linux）时，token 只存活在这个变量里，绝不落盘。
// 进程退出即丢失，这是刻意的：宁可让用户重填一次，也不把明文写到磁盘上。
let memoryToken: string | null = null

// 读缓存：进程内缓存最近一次读到的 repos，避免每次 IPC 都同步读盘。
// 刻意不做定时失效——单进程内一致性就够，也没人会绕过 store 直接改文件。
let reposCache: Repo[] | null = null

function dbFilePath(): string {
  const fileName = isMockMode() ? 'starflow.mock.db.json' : 'starflow.db.json'
  return join(app.getPath('userData'), fileName)
}

function getDb(): Promise<Low<DbSchema>> {
  if (!dbPromise) {
    // 惰性初始化：必须等 app ready 之后才会调用到，所以这里取 userData 是安全的。
    // 首次启动 / 自检脚手架下 userData 可能还不存在，先兜底建目录，否则 lowdb 写盘会 ENOENT。
    const file = dbFilePath()
    try {
      mkdirSync(dirname(file), { recursive: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`创建数据目录失败：${message}`)
    }
    // 原子写交给 lowdb 7 的 JSONFile 适配器（内部用 steno），不要自己写 tmp + rename
    dbPromise = JSONFilePreset<DbSchema>(file, { repos: [], token: null })
  }
  return dbPromise
}

/** 统一错误处理：日志留原始信息，抛出去的信息保持可读 */
function fail(action: string, err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[store] ${action}失败：${message}`)
  throw new Error(`${action}失败：${message}`)
}

export async function getRepos(): Promise<Repo[]> {
  try {
    // 缓存命中直接返回副本：调用方（前端 / 各业务模块）会原地改对象，
    // 直接返回引用会把缓存的内部状态改脏。
    if (reposCache) {
      return structuredClone(reposCache)
    }

    const db = await getDb()
    // 种子判断必须基于"真实读盘结果"而不是缓存，否则加了读缓存之后首次播种会失效
    if (db.data.repos.length === 0 && isMockMode()) {
      console.log('[store] 数据为空，写入 mock 种子数据')
      db.data.repos = await mockStarred()
      await db.write()
    }
    reposCache = structuredClone(db.data.repos)
    return structuredClone(reposCache)
  } catch (err) {
    return fail('读取本地数据', err)
  }
}

export async function saveRepos(repos: Repo[]): Promise<void> {
  try {
    const db = await getDb()
    db.data.repos = repos
    await db.write()
    // 写盘成功之后再更新缓存，保证缓存永远不比磁盘更新
    reposCache = structuredClone(repos)
    console.log('[store] 仓库列表已保存，共', repos.length, '条')
  } catch (err) {
    fail('保存本地数据', err)
  }
}

export async function saveToken(token: string): Promise<void> {
  // 空 token 会让 hasToken() 误判成"已配置"，进而跳过设置引导，所以直接拒绝。
  // 放在 try 外面是为了让这条消息原样透出去，不被 fail() 再包一层。
  if (!token || token.trim() === '') {
    throw new Error('Token 不能为空')
  }

  try {
    const db = await getDb()
    const encrypted = safeStorage.isEncryptionAvailable()
    if (encrypted) {
      db.data.token = safeStorage.encryptString(token).toString('base64')
      // 后端可用时要清掉内存里的残留，否则 getToken() 会优先命中旧的内存值
      memoryToken = null
    } else {
      // Linux 上没有 keyring 时 isEncryptionAvailable() 返回 false，此时一个字节都不写盘，
      // token 只留在主进程内存里（契约见 docs/module-signatures.md 的 saveToken 说明）。
      //
      // 为什么不抛错：代价是「无 keyring 的机器上真实模式完全不可用」。顺带纠正一句早先的
      // 错误说法——saveToken / getToken **不在启动路径上**（调用点是 IPC.STORE_SAVE_TOKEN
      // ← 设置页的保存按钮、IPC.STORE_HAS_TOKEN ← 打开设置页、getToken ← github.client()），
      // app.whenReady() 一处都不碰，详见 issue #9 的核实评论。
      // 为什么不降级成带前缀的明文：那仍然把明文写进了磁盘，契约字面「禁止以任何形式把明文
      // 写入磁盘」满足不了，前缀也不提供任何保护（issue #12 的 (a)/(b)/(c) 比较）。
      console.warn('[store] 系统未提供加密后端，token 仅保存在内存中，重启后需重新填写')
      memoryToken = token
      // 置 null 是本次的迁移路径：把历史上可能已经写进文件的 'PLAIN:' 明文抹掉
      db.data.token = null
    }
    // 两种情况都要写盘：true 分支落密文，false 分支落 null（清掉旧明文）
    await db.write()
    // 只打印是否加密，绝不打印 token 本身
    console.log(`[store] Token 已保存（${encrypted ? 'safeStorage 加密' : '仅内存，未落盘'}）`)
  } catch (err) {
    fail('保存 Token', err)
  }
}

export async function getToken(): Promise<string | null> {
  try {
    // 内存优先：无加密后端时 token 只活在这里，磁盘上什么都没有
    if (memoryToken !== null) return memoryToken

    const db = await getDb()
    const stored = db.data.token
    if (!stored) return null

    // 只读不写：兼容别人机器上遗留的 'PLAIN:xxx' 旧数据。
    // 按前缀识别明文，而不是看 isEncryptionAvailable()：
    // 换机器之后加密后端可能又可用了，但文件里躺着的仍然是明文，用后端能力判断会读错。
    if (stored.startsWith(PLAIN_PREFIX)) {
      return stored.slice(PLAIN_PREFIX.length)
    }

    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch (err) {
      // 换机器 / keyring 变更会导致解不开。这里只降级成"没有 token"，绝不往外抛——
      // 抛错的实际后果只是「点同步」那一步弹一条错误提示，不影响应用启动：
      // getToken 由 github.client() 调用、hasToken 由设置页调用，都不在启动路径上
      // （早先此处写作「getToken / hasToken 在启动路径上，抛错等于应用打不开」，经 issue #9 核实为误）。
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[store] Token 解密失败，已忽略：${message}`)
      return null
    }
  } catch (err) {
    return fail('读取 Token', err)
  }
}

/** 渲染进程只需要判断"要不要让用户填 token"，返回布尔值即可，不要把 token 本身送过去 */
export async function hasToken(): Promise<boolean> {
  try {
    // 内存里有就直接返回，省掉一次读盘（getToken() 内部也是内存优先，这里只是短路）
    return memoryToken !== null || (await getToken()) !== null
  } catch (err) {
    return fail('检查 Token', err)
  }
}

/**
 * 退出登录。（契约见 docs/module-signatures.md）
 *
 * 为什么必须在这里实现而不是绕过去调 saveToken('')：saveToken 会拒绝空串，
 * 而 memoryToken 是本模块的私有变量，外面清不掉。
 *
 * 顺序是**先写盘、再清内存**，和 saveToken 正好相反，这是刻意的：
 * getToken() 内存优先，如果写盘失败却已经清了内存，下一次 getToken() 会读到磁盘上
 * 残留的 token，等于悄悄把会话复活了。宁可失败得响一点。
 *
 * 不清 reposCache：仓库列表（AI 结果、clone 路径、fork 标记）是用户的本地数据，
 * 按 full_name 索引、跟 token 无关，登出时清掉是纯数据损失。
 */
export async function clearToken(): Promise<void> {
  try {
    const db = await getDb()
    db.data.token = null
    await db.write()
    // 无加密后端时 token 只活在内存里，这一行才是真正让它失效的地方
    memoryToken = null
    console.log('[store] Token 已清除')
  } catch (err) {
    fail('清除 Token', err)
  }
}

/** 只更新 local 字段，其余字段（含 AI 结果）原样保留 */
export async function updateLocalState(
  fullName: string,
  state: Partial<LocalState>
): Promise<void> {
  try {
    // 剔除值为 undefined 的键：不然 updateLocalState(f, { cloned_path: undefined })
    // 会把已有的 cloned_path 直接抹成 undefined（浅合并的经典坑）。
    // Object.fromEntries 的返回类型被退化成索引签名，这里用断言收敛回契约类型，不是用 any 掩盖问题。
    const patch = Object.fromEntries(
      Object.entries(state).filter(([, v]) => v !== undefined)
    ) as Partial<LocalState>

    const db = await getDb()
    const repo = db.data.repos.find((r) => r.full_name === fullName)
    if (!repo) {
      // 不抛错：这条只是一个本地标记，一条脏数据不该让调用方整批动作失败
      console.warn(`[store] updateLocalState 未找到仓库：${fullName}`)
      return
    }

    repo.local = { ...repo.local, ...patch }
    await db.write()

    // 缓存里那条也要同步，否则后续 getRepos() 会把刚写的状态又盖回去
    const cached = reposCache?.find((r) => r.full_name === fullName)
    if (cached) {
      cached.local = { ...cached.local, ...patch }
    }

    console.log('[store] 本地状态已更新', fullName, Object.keys(patch))
  } catch (err) {
    fail('更新本地状态', err)
  }
}

/**
 * 只清掉 local.cloned_path，其余 local 字段（fork 标记等）原样保留。
 *
 * 为什么不能复用 updateLocalState(f, { cloned_path: undefined })：它开头就把值为
 * undefined 的键过滤掉了（那不是 bug，是防止浅合并把已有值抹没），而 Electron IPC 的
 * 结构化克隆和 JSON.stringify 也都会丢掉 undefined——三重原因叠在一起，
 * "用 undefined 表示删除"这条路根本走不通，必须有个显式的删除函数。
 */
export async function clearClonedPath(fullName: string): Promise<void> {
  await clearClonedPaths([fullName])
}

/**
 * 批量清 cloned_path，**只写一次盘**。对账可能一次命中几十个仓库，逐个调用会有
 * N 次全量落盘，而且和 ai.ts、index.ts 里的 saveRepos 之间并没有互斥。
 *
 * 刻意不用 saveRepos(过滤后的整个新数组)：那会把并发的写入（比如正在跑的 AI 富化）
 * 用一份旧快照整个覆盖掉。
 *
 * 找不到仓库时只 warn 不抛，与 updateLocalState 一致：一条脏数据不该让调用方整批失败。
 */
export async function clearClonedPaths(fullNames: string[]): Promise<void> {
  if (fullNames.length === 0) return

  try {
    const targets = new Set(fullNames)
    const db = await getDb()

    let changed = 0
    for (const repo of db.data.repos) {
      if (!targets.has(repo.full_name)) continue
      // 用 delete 而不是解构省略键：eslint.config.js 的 no-unused-vars 没开
      // varsIgnorePattern，解构出来不用的变量会被判成未使用。
      // ⚠️ local 本身可能是 undefined，delete undefined.x 会抛 TypeError。
      if (repo.local && repo.local.cloned_path !== undefined) {
        delete repo.local.cloned_path
        changed += 1
      }
    }

    // 一个都没命中就不写盘：既省一次落盘，也避免把一次空操作写进日志
    if (changed === 0) {
      console.warn('[store] clearClonedPaths 未命中任何仓库：', fullNames)
      return
    }

    await db.write()

    // 缓存里那几条也要同步，否则后续 getRepos() 会把刚清掉的路径又盖回来
    for (const cached of reposCache ?? []) {
      if (targets.has(cached.full_name) && cached.local) {
        delete cached.local.cloned_path
      }
    }

    console.log('[store] 已清除克隆路径记录', changed, '条')
  } catch (err) {
    fail('清除克隆路径', err)
  }
}

/* ------------------------------------------------------------------ */
/* AI 配置 —— Phase 0 占位，实现在 AI 配置那个 PR 里补                   */
/* ------------------------------------------------------------------ */
/*
 * 为什么这三条归 store 而不是 ai：加密与落盘全都复用本文件上面那套 token 范式
 * （safeStorage 可用就存密文、不可用就一个字节都不写盘），放在一起照抄才不会串。
 *
 * 契约上最要紧的一条：**密钥只进不出**。getAiConfig 返回的 AiConfigView 里
 * 压根没有 apiKey 字段，所以"界面上不回显明文"不是靠调用方自觉，是类型层面
 * 就做不到。baseUrl / model 不是秘密，明文存、可以回传。
 *
 * 这里刻意抛「尚未实现」而不是返回假数据：设置页一旦被接到这些桩上，会立刻
 * 看见一条明确的错误，而不是显示"未配置"让人以为 key 丢了。
 */

export async function getAiConfig(): Promise<AiConfigView> {
  throw new Error('尚未实现')
}

export async function saveAiConfig(patch: AiConfigPatch): Promise<void> {
  void patch
  throw new Error('尚未实现')
}

/** 只清密钥，baseUrl / model 保留（与 clearToken 只清 token 同一个粒度） */
export async function clearAiKey(): Promise<void> {
  throw new Error('尚未实现')
}
