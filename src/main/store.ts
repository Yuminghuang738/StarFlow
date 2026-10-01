// 负责人：P3 ｜ 骨架版已可用，P3 负责加固（原子写、缓存、错误分支）
//
// 数据落盘位置：app.getPath('userData')/starpilot.db.json
// mock 模式单独用一个库文件，避免演示数据和真实数据互相污染。

import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { app, safeStorage } from 'electron'
import type { Low } from 'lowdb'
import { JSONFilePreset } from 'lowdb/node'
import type { Repo, LocalState } from '@shared/types'
import { isMockMode } from './config'
import { mockStarred } from './mock'

interface DbSchema {
  repos: Repo[]
  token: string | null
}

/**
 * 无加密后端（例如没装 keyring 的 Linux）时的明文标记。
 * 明文落盘时必须带这个前缀，getToken() 靠它识别并剥离；否则密文和明文无法区分。
 */
const PLAIN_PREFIX = 'PLAIN:'

// 模块级缓存：lowdb 的实例要复用，否则并发调用会各自读一遍文件
let dbPromise: Promise<Low<DbSchema>> | null = null

// 读缓存：进程内缓存最近一次读到的 repos，避免每次 IPC 都同步读盘。
// 刻意不做定时失效——单进程内一致性就够，也没人会绕过 store 直接改文件。
let reposCache: Repo[] | null = null

function dbFilePath(): string {
  const fileName = isMockMode() ? 'starpilot.mock.db.json' : 'starpilot.db.json'
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
    } else {
      // Linux 上没有 keyring 时 isEncryptionAvailable() 返回 false。
      // 这里刻意降级成明文 + 警告，而不是抛错——saveToken 在启动路径上，抛错会让应用直接打不开。
      // 加 'PLAIN:' 前缀让明文在 db 文件里可识别（DoD：不允许出现裸的 test-token-123）。
      // 【未决事项】"降级还是抛错"由 P7 决定，见 prompts/p3-store-local.md 的 A4，先不要删这个分支。
      console.warn('[store] 系统未提供加密后端，token 将以明文保存')
      db.data.token = PLAIN_PREFIX + token
    }
    await db.write()
    // 只打印是否加密，绝不打印 token 本身
    console.log(`[store] Token 已保存（${encrypted ? 'safeStorage 加密' : '明文降级'}）`)
  } catch (err) {
    fail('保存 Token', err)
  }
}

export async function getToken(): Promise<string | null> {
  try {
    const db = await getDb()
    const stored = db.data.token
    if (!stored) return null

    // 按前缀识别明文，而不是看 isEncryptionAvailable()：
    // 换机器之后加密后端可能又可用了，但文件里躺着的仍然是明文，用后端能力判断会读错。
    if (stored.startsWith(PLAIN_PREFIX)) {
      return stored.slice(PLAIN_PREFIX.length)
    }

    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch (err) {
      // 换机器 / keyring 变更会导致解不开。这里只降级成"没有 token"，绝不往外抛——
      // getToken / hasToken 在启动路径上，抛错等于应用打不开。
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
    return (await getToken()) !== null
  } catch (err) {
    return fail('检查 Token', err)
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
