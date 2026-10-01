// 负责人：P1 ｜ 接口规格见 docs/module-signatures.md（冻结），任务说明见 prompts/
// 真实实现：读走 GitHub REST API（Octokit）；MOCK_MODE=true 时全部走 mock.ts，不发任何网络请求。
// 本文件只负责「GitHub 侧的数据读写」，不碰 store：unstar 之后从本地列表移除是 index.ts 的职责。

import { Octokit } from 'octokit'
import type { Repo, Release, Commit } from '@shared/types'
import { isMockMode } from './config'
import * as store from './store'
import { mockStarred, mockReadme, mockReleases, mockCommits, mockUnstar, mockFork } from './mock'

/** 分页：每页 100（GitHub 上限），最多 3 页 = 300 条，首页加载不能被无限翻页拖死 */
const PER_PAGE = 100
const MAX_PAGES = 3
/** 详情页最多取 10 条 Release / Commit */
const LIST_LIMIT = 10
/** README 截断阈值，防止极端仓库把内存撑爆 */
const MAX_README_LENGTH = 200000

// ============================================================
// Octokit 实例：模块级缓存，token 变了就重建
// ============================================================

let cachedToken: string | null = null
let cachedOctokit: Octokit | null = null

async function client(): Promise<Octokit> {
  const token = await store.getToken()
  if (!token) throw new Error('未配置 GitHub Token，请到设置页填入后重试')
  if (!cachedOctokit || cachedToken !== token) {
    cachedToken = token
    cachedOctokit = new Octokit({ auth: token })
  }
  return cachedOctokit
}

// ============================================================
// 工具函数
// ============================================================

function splitFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) throw new Error(`仓库全名格式不对：${fullName}（应为 owner/repo）`)
  return { owner, repo }
}

/** 取出 HTTP 状态码；只有判断分支用得上，拿不到就返回 undefined */
function statusOf(err: unknown): number | undefined {
  return (err as { status?: number }).status
}

/** 把 Octokit 抛出的英文错误翻译成能指导用户排查的中文信息 */
function toReadableError(err: unknown, action: string): Error {
  const status = statusOf(err)
  const message = err instanceof Error ? err.message : String(err)
  if (status === 401) return new Error('GitHub Token 无效或已过期，请在设置页重新配置')
  if (status === 403)
    return new Error('权限不足或速率受限：请确认 Token 勾选了 public_repo scope，且未超出 API 限额')
  if (status === 404) return new Error(`仓库不存在或无权访问：${action}`)
  if (status === 409) return new Error('仓库为空，没有可用的提交记录')
  if (status === 429) return new Error('请求过于频繁，请稍后再试')
  return new Error(`${action} 失败：${message}`)
}

/** starred_at 倒序排序用；解析不出来的当作 0，避免 NaN 把排序打乱 */
function toTimestamp(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

// ============================================================
// GitHub 返回值的窄化类型
//
// @octokit 的类型是 OpenAPI 生成物，和运行时的真实形状并不总是对得上：
// 带 `Accept: application/vnd.github.star+json` 时，star 列表的每一项其实是
// `{ starred_at, repo }`，而类型里声明的只有仓库本身。所以这里按「只声明我们会读到的
// 字段、且一律当作可能缺失」来收窄，既不写 any 也不假装类型是准的。
// ============================================================

interface RawRepo {
  id: number
  full_name: string
  html_url: string
  description?: string | null
  language?: string | null
  stargazers_count?: number
  pushed_at?: string | null
  topics?: string[]
}

/** star+json 下的包装结构；不带该 media type 时拿到的就是 RawRepo 本身 */
interface RawStarredItem {
  starred_at?: string
  repo?: RawRepo
}

interface RawRelease {
  tag_name: string
  name?: string | null
  published_at?: string | null
  html_url: string
}

interface RawCommit {
  sha: string
  html_url: string
  commit?: {
    message?: string | null
    author?: { date?: string | null } | null
    committer?: { date?: string | null } | null
  } | null
}

// ============================================================
// 6 个导出函数（签名冻结，见 docs/module-signatures.md）
// ============================================================

export async function fetchStarred(): Promise<Repo[]> {
  if (isMockMode()) return mockStarred()

  const octokit = await client()
  try {
    const all: Repo[] = []
    let pages = 0

    for (let page = 1; page <= MAX_PAGES; page++) {
      // 必须是 *ByAuthenticatedUser（GET /user/starred）：
      // listReposStarredByUser 打的是 /users/{username}/starred，要额外传 username，
      // 而且读的是别人的公开 Star，拿不到 starred_at，本应用要的是「我自己」的 Star。
      const res = await octokit.rest.activity.listReposStarredByAuthenticatedUser({
        per_page: PER_PAGE,
        page,
        mediaType: { format: 'star+json' }
      })

      // 防御：正常一定是数组，不是数组就直接收工，别让首页炸掉
      const items: unknown[] = Array.isArray(res.data) ? res.data : []
      pages = page

      for (const raw of items) {
        const wrapper = raw as RawStarredItem
        // star+json 时是 { starred_at, repo }，否则就是仓库本身，两种都要能处理
        const r = wrapper.repo ?? (raw as RawRepo)
        const starredAt = wrapper.starred_at ?? r.pushed_at ?? new Date().toISOString()

        all.push({
          id: r.id,
          full_name: r.full_name,
          description: r.description ?? null,
          language: r.language ?? null,
          stargazers_count: r.stargazers_count ?? 0,
          html_url: r.html_url,
          starred_at: starredAt,
          topics: Array.isArray(r.topics) ? r.topics : [],
          pushed_at: r.pushed_at ?? null,
          // 固定 null，由 tracker 负责填充；这里不要顺手去拉 Release，会让首页极慢
          latest_release: null
        })
        // 注意：不要设置 ai_summary / ai_category / local，
        // 这几个字段的既有值由调用方保留，这里碰了就等于把 AI 结果清空。
      }

      // 不满一页说明已经是最后一页
      if (items.length < PER_PAGE) break
    }

    all.sort((a, b) => toTimestamp(b.starred_at) - toTimestamp(a.starred_at))

    console.log(`[github] fetchStarred 完成，共 ${all.length} 条（${pages} 页）`)
    return all
  } catch (err) {
    throw toReadableError(err, '获取 Star 列表')
  }
}

export async function fetchReadme(fullName: string): Promise<string> {
  if (isMockMode()) return mockReadme(fullName)

  const { owner, repo } = splitFullName(fullName)
  const octokit = await client()
  try {
    const res = await octokit.rest.repos.getReadme({ owner, repo })
    const content = res.data.content
    if (!content) return ''

    const text = Buffer.from(content, 'base64').toString('utf8')
    return text.length > MAX_README_LENGTH ? text.slice(0, MAX_README_LENGTH) : text
  } catch (err) {
    // 仓库没有 README 不是错误：返回空串，让上层走「没有 README」的分支
    if (statusOf(err) === 404) {
      console.log(`[github] ${fullName} 没有 README，返回空字符串`)
      return ''
    }
    throw toReadableError(err, `获取 ${fullName} 的 README`)
  }
}

export async function fetchReleases(fullName: string): Promise<Release[]> {
  if (isMockMode()) return mockReleases(fullName)

  const { owner, repo } = splitFullName(fullName)
  const octokit = await client()
  try {
    const res = await octokit.rest.repos.listReleases({ owner, repo, per_page: LIST_LIMIT })
    const items: unknown[] = Array.isArray(res.data) ? res.data : []

    return items.map((item) => {
      const r = item as RawRelease
      return {
        tag_name: r.tag_name,
        name: r.name ?? null,
        // 草稿 Release 的 published_at 可能是 null，而契约里它是 string
        published_at: r.published_at ?? '',
        html_url: r.html_url
      }
    })
  } catch (err) {
    // 仓库不存在（404）/ 空仓库（409）都给空列表，不要对着详情页报错
    const status = statusOf(err)
    if (status === 404 || status === 409) {
      console.log(`[github] ${fullName} 没有可用的 Release（HTTP ${status}）`)
      return []
    }
    throw toReadableError(err, `获取 ${fullName} 的 Release`)
  }
}

export async function fetchCommits(fullName: string): Promise<Commit[]> {
  if (isMockMode()) return mockCommits(fullName)

  const { owner, repo } = splitFullName(fullName)
  const octokit = await client()
  try {
    const res = await octokit.rest.repos.listCommits({ owner, repo, per_page: LIST_LIMIT })
    const items: unknown[] = Array.isArray(res.data) ? res.data : []

    return items.map((item) => {
      const c = item as RawCommit
      return {
        sha: c.sha,
        // commit message 只保留第一行，正文对列表没有价值
        message: (c.commit?.message ?? '').split('\n')[0],
        date: c.commit?.author?.date ?? c.commit?.committer?.date ?? '',
        html_url: c.html_url
      }
    })
  } catch (err) {
    // 空仓库 GitHub 返回 409，仓库不存在返回 404
    const status = statusOf(err)
    if (status === 404 || status === 409) {
      console.log(`[github] ${fullName} 没有可用的提交记录（HTTP ${status}）`)
      return []
    }
    throw toReadableError(err, `获取 ${fullName} 的提交记录`)
  }
}

export async function unstar(fullName: string): Promise<void> {
  if (isMockMode()) {
    mockUnstar(fullName)
    return
  }

  const { owner, repo } = splitFullName(fullName)
  const octokit = await client()
  try {
    // 成功返回 204，没有响应体
    await octokit.rest.activity.unstarRepoForAuthenticatedUser({ owner, repo })
    console.log(`[github] 已取消 Star: ${fullName}`)
    // ⚠️ 这里只做 API 调用。从本地列表移除由 index.ts 的 handler 负责，
    // 在这里再删一次会造成双重删除和竞态。
  } catch (err) {
    throw toReadableError(err, `取消 Star ${fullName}`)
  }
}

export async function fork(fullName: string): Promise<Repo> {
  if (isMockMode()) return mockFork(fullName)

  const { owner, repo } = splitFullName(fullName)
  const octokit = await client()
  try {
    const res = await octokit.rest.repos.createFork({ owner, repo })
    const data = res.data
    const forkedAt = new Date().toISOString()

    const forked: Repo = {
      id: data.id,
      full_name: data.full_name,
      description: data.description ?? null,
      language: data.language ?? null,
      stargazers_count: data.stargazers_count ?? 0,
      html_url: data.html_url,
      // fork 出来的仓库没有「star 时间」，用当下时间占位
      starred_at: forkedAt,
      topics: data.topics ?? [],
      pushed_at: data.pushed_at ?? null,
      latest_release: null,
      // 与 mockFork 保持一致，前端靠这两个字段显示「已 Fork」；不自动 clone，clone 是独立操作
      local: { forked_full_name: data.full_name, forked_at: forkedAt }
    }

    console.log(`[github] 已 Fork: ${fullName} -> ${forked.full_name}`)
    // GitHub 的 fork 是异步的，这里可能拿到一个还在创建中的仓库。
    // 不轮询、不 sleep：前端展示的是状态和链接，不依赖它是否创建完成。
    return forked
  } catch (err) {
    throw toReadableError(err, `Fork ${fullName}`)
  }
}
