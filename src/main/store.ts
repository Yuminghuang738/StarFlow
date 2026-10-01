// 负责人：P3 ｜ 骨架版已可用，P3 负责加固（原子写、缓存、错误分支）
//
// 数据落盘位置：app.getPath('userData')/starpilot.db.json
// mock 模式单独用一个库文件，避免演示数据和真实数据互相污染。

import { join } from 'node:path'
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

// 模块级缓存：lowdb 的实例要复用，否则并发调用会各自读一遍文件
let dbPromise: Promise<Low<DbSchema>> | null = null

function dbFilePath(): string {
  const fileName = isMockMode() ? 'starpilot.mock.db.json' : 'starpilot.db.json'
  return join(app.getPath('userData'), fileName)
}

function getDb(): Promise<Low<DbSchema>> {
  if (!dbPromise) {
    // 惰性初始化：必须等 app ready 之后才会调用到，所以这里取 userData 是安全的
    dbPromise = JSONFilePreset<DbSchema>(dbFilePath(), { repos: [], token: null })
  }
  return dbPromise
}

/** 统一错误处理：日志留原始信息，抛出去的信息保持可读 */
function fail(action: string, err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[store] ${action}失败:`, message)
  throw new Error(`${action}失败: ${message}`)
}

export async function getRepos(): Promise<Repo[]> {
  try {
    const db = await getDb()
    // 首次启动（或换到 mock 模式）库里是空的，用 mock 种子灌一次
    if (db.data.repos.length === 0 && isMockMode()) {
      db.data.repos = await mockStarred()
      await db.write()
    }
    return db.data.repos
  } catch (err) {
    return fail('读取仓库列表', err)
  }
}

export async function saveRepos(repos: Repo[]): Promise<void> {
  try {
    const db = await getDb()
    db.data.repos = repos
    await db.write()
  } catch (err) {
    fail('保存仓库列表', err)
  }
}

export async function saveToken(token: string): Promise<void> {
  try {
    const db = await getDb()
    if (safeStorage.isEncryptionAvailable()) {
      db.data.token = safeStorage.encryptString(token).toString('base64')
    } else {
      // Linux 上没有 keyring 时 isEncryptionAvailable() 返回 false。
      // 这里刻意降级成明文 + 警告，而不是抛错——否则应用直接打不开。
      console.warn('[store] 系统未提供加密后端，token 将以明文保存')
      db.data.token = token
    }
    await db.write()
  } catch (err) {
    fail('保存 token', err)
  }
}

export async function getToken(): Promise<string | null> {
  try {
    const db = await getDb()
    const stored = db.data.token
    if (!stored) return null
    if (!safeStorage.isEncryptionAvailable()) {
      // 加密后端不可用时，存进去的就是明文，直接返回
      return stored
    }
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      // 换机器/keyring 变更会导致解不开；当作没有 token，让用户重新填
      console.warn('[store] token 解密失败，已忽略')
      return null
    }
  } catch (err) {
    return fail('读取 token', err)
  }
}

/** 渲染进程只需要判断"要不要让用户填 token"，返回布尔值即可，不要把 token 本身送过去 */
export async function hasToken(): Promise<boolean> {
  try {
    return (await getToken()) !== null
  } catch (err) {
    return fail('检查 token', err)
  }
}

/** 只更新 local 字段，其余字段（含 AI 结果）原样保留 */
export async function updateLocalState(fullName: string, state: Partial<LocalState>): Promise<void> {
  try {
    const db = await getDb()
    const repo = db.data.repos.find((r) => r.full_name === fullName)
    if (!repo) {
      throw new Error(`仓库不存在: ${fullName}`)
    }
    repo.local = { ...repo.local, ...state }
    await db.write()
  } catch (err) {
    fail('更新本地状态', err)
  }
}
