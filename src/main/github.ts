// 接口规格见 docs/module-signatures.md（冻结）
// 真实实现：读走 GitHub REST API（Octokit）；MOCK_MODE=true 时全部走 mock.ts，不发任何网络请求。
// 本文件只负责「GitHub 侧的数据读写」，不碰 store：unstar 之后从本地列表移除是 index.ts 的职责。

import { Octokit } from 'octokit'
import type { Repo, Release, Commit } from '@shared/types'
import { isMockMode } from './config'
import * as store from './store'
import { mockStarred, mockReadme, mockReleases, mockCommits, mockUnstar, mockFork, mockSearch, mockStar } from './mock'

/**
 * 分页：每页 100（GitHub 上限）。翻到"这一页不满"就停（见下面的 break），
 * MAX_PAGES 只是防病态账号的阀门，不是"我们打算取多少条"。
 *
 * ⚠️ 这个数原来写的是 3（=300 条），依据是"首页加载不能被无限翻页拖死"——那条理由
 * **不成立**：首屏那一次读的是本地库（store.getRepos），fetchStarred 只在用户点
 * 「从 GitHub 同步」和设置页「测试连接」时被调用，两次都是显式动作，多翻几页只多花
 * 几秒。而 300 这个上限的代价是实打实的：
 *   ① 收藏超过 300 个的人，同步拿到的是**被截断的列表**，界面上那句
 *      "已从 GitHub 同步 300 个仓库"看不出它是截断的；
 *   ② 更糟的是 mergeRepos 以远端为基准（见 renderer 的 repoStore.ts），
 *      第 300 名之外的仓库会被当成"已经不在 GitHub 上了"从本地列表里消失，
 *      连它们的 cloned_path / forked_full_name 一起丢——那是真的数据丢失，
 *      而主进程的磁盘对账（数据源正是这份记录）也救不回来。
 * 2000 条（20 页）足够覆盖个人账号，最坏 20 次串行请求，对一次显式同步可以接受。
 * 真撞上阀门时仍会截断，所以命中时留一条明确的日志（见下面那条 warn），不要让它
 * 悄悄发生。
 */
const MAX_PAGES = 20
const PER_PAGE = 100
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
  // 说「没有读到」而不是「未配置」：getToken() 在密文解不开时（换机器 / 密钥环变更）
  // 同样返回 null，那一条不能被说成"你从没配过"——设置页会用 hasToken() 把这种
  // 情况单独显示成「读不到」并说明原因，这里只要别把用户指错方向就行。
  if (!token) {
    throw new Error('没有读到 GitHub Token（未配置，或本地那条记录解不开），请到设置页确认后重试')
  }
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

    // 撞上阀门（而不是因为翻到最后一页）时，返回的列表是不完整的——调用方看不出来
    // （fetchStarred 的返回类型被契约冻结成一个纯数组，没有"还有更多"的位置可放），
    // 所以至少要在这里留下痕迹，别让它悄悄发生。
    if (pages === MAX_PAGES && all.length === MAX_PAGES * PER_PAGE) {
      console.warn(
        `[github] Star 列表达到 ${MAX_PAGES} 页上限（${all.length} 条），后面还有没拉；` +
          '调用方会把这份不完整的列表当成完整列表用于同步'
      )
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

// ============================================================
// 仓库推荐用到的两个补充（PR 4 新增，不在上面那 6 个冻结导出里）
// ============================================================

/** 搜索接口返回项的窄化类型：Repo 契约里没有 owner / default_branch 这些字段 */
interface RawSearchRepo {
  id?: number
  full_name?: string
  html_url?: string
  description?: string | null
  language?: string | null
  stargazers_count?: number
  pushed_at?: string | null
  topics?: string[]
}

/** 搜索默认返回条数 */
const SEARCH_LIMIT = 20

/**
 * 搜索仓库。
 *
 * ⚠️ 刻意**不传 sort**：GitHub 默认给的是"最佳匹配"排序，这正是自然语言查询要的；
 * 传 stars / updated 会把相关度挤掉，搜出来的东西就与查询意图无关了。
 * 搜索接口的限频比其它接口紧得多（约 30 次/分钟），撞上会返回 403，文案已在
 * toReadableError 里覆盖。
 */
export async function searchRepos(query: string, limit = SEARCH_LIMIT): Promise<Repo[]> {
  const q = query.trim()
  if (!q) return []
  if (isMockMode()) return mockSearch(q, limit)

  const octokit = await client()
  try {
    const res = await octokit.rest.search.repos({ q, per_page: limit })
    const items: unknown[] = Array.isArray(res.data?.items) ? res.data.items : []

    return items
      .map((item) => item as RawSearchRepo)
      .filter(
        (r): r is RawSearchRepo & { id: number; full_name: string; html_url: string } =>
          typeof r.id === 'number' &&
          typeof r.full_name === 'string' &&
          typeof r.html_url === 'string'
      )
      .map((r) => ({
        id: r.id,
        full_name: r.full_name,
        description: r.description ?? null,
        language: r.language ?? null,
        stargazers_count: r.stargazers_count ?? 0,
        html_url: r.html_url,
        // ⚠️ 搜索结果里**没有「我什么时候 star 的」**（那要走 /user/starred）。这里用
        // pushed_at 占位，所以推荐列表刻意不渲染相对时间——那会显示成"最后推送时间"，
        // 看起来像 Star 时间，是实打实的误导。
        starred_at: r.pushed_at ?? '',
        topics: Array.isArray(r.topics) ? r.topics : [],
        pushed_at: r.pushed_at ?? null,
        latest_release: null
      }))
  } catch (err) {
    throw toReadableError(err, `搜索「${q}」`)
  }
}

/**
 * 给仓库加 Star，并回读一次拿完整数据。
 *
 * ⚠️ 与 unstar 同样的纪律：这里**只做 API 调用**，写本地列表由 index.ts 的 handler
 * 负责。两处都写会变成双重写入加竞态。
 */
export async function star(fullName: string): Promise<Repo> {
  if (isMockMode()) return mockStar(fullName)

  const { owner, repo } = splitFullName(fullName)
  const octokit = await client()

  try {
    // PUT 是幂等的：已经 Star 过也返回 204，不会报错
    await octokit.rest.activity.starRepoForAuthenticatedUser({ owner, repo })
  } catch (err) {
    throw toReadableError(err, `Star ${fullName}`)
  }

  // ⚠️ 从这一行往下，**Star 这件事已经真的成立了**（204 就是成功）。
  // 下面的回读纯粹是为了拿到仓库数据，它失败绝不能报成"Star 失败"——
  // 那是把一次成功说成失败：用户会以为自己没 Star 上（去重试、去翻 GitHub），
  // 而真相是这个操作早就生效了。所以两段 try 必须分开，报错文案也要说清
  // "已经 Star 了，只是详情没读回来"，并给出正确的下一步（同步一次即可）。
  try {
    // Star 接口本身只有 204、没有响应体，要拿仓库数据必须再读一次
    const res = await octokit.rest.repos.get({ owner, repo })
    const d = res.data

    const starred: Repo = {
      id: d.id,
      full_name: d.full_name,
      description: d.description ?? null,
      language: d.language ?? null,
      stargazers_count: d.stargazers_count ?? 0,
      html_url: d.html_url,
      // 这次调用同样拿不到 starred_at（只有 /user/starred 会带），用当下时间占位，
      // 与 fork() 的约定一致
      starred_at: new Date().toISOString(),
      topics: d.topics ?? [],
      pushed_at: d.pushed_at ?? null,
      latest_release: null
    }

    console.log(`[github] 已 Star: ${fullName}`)
    return starred
  } catch (err) {
    const reason = toReadableError(err, `读取 ${fullName} 的信息`).message
    throw new Error(
      `已经在 GitHub 上 Star 了 ${fullName}，但没能读回它的详细信息（${reason}）。` +
        ' 到「收藏管理」点一次「从 GitHub 同步」就能把它拉进列表。'
    )
  }
}
