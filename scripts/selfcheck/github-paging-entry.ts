// github.fetchStarred 的分页自检：真实模式 + 打桩 fetch，验证「翻到不满一页为止」
// 以及最后那道防病态账号的阀门。
//
// 跑法：node scripts/selfcheck/github-paging.mjs（驱动器会用 esbuild 打包本文件，
// 把 electron 打桩掉，并用固定 RUN_ID 起子进程。）
//
// 为什么需要它：这个上限曾经是 3 页（300 条），而超出的部分会被静默截断——
// 界面照旧报「已从 GitHub 同步 300 个仓库」，调用方（renderer 的 mergeRepos）
// 还会把第 300 名之外的仓库当成"已经不在 GitHub 上了"而从本地列表里删掉，
// 连同它们的 cloned_path / forked_full_name。这几条断言就是钉住这件事不再发生。
import * as github from '../../src/main/github'
import * as store from '../../src/main/store'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

const PER_PAGE = 100
/** 与 github.ts 里的 MAX_PAGES 对齐（自检里独立写死，改上限时这里必须一起改） */
const MAX_PAGES = 20

/** 造一页 star+json 形态的条目：{ starred_at, repo } */
function makeItems(from: number, count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => {
    const n = from + i
    return {
      starred_at: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
      repo: {
        id: n,
        full_name: `owner/repo-${n}`,
        description: null,
        language: 'TypeScript',
        stargazers_count: n,
        html_url: `https://github.com/owner/repo-${n}`,
        topics: [],
        pushed_at: null
      }
    }
  })
}

/** 打桩用的 fetch：按 ?page= 返回该页，记下每一次请求的页码 */
function installFetch(total: number, calls: number[]): void {
  globalThis.fetch = (async (input: unknown): Promise<Response> => {
    const url = new URL(String(input))
    const page = Number(url.searchParams.get('page') ?? '1')
    calls.push(page)
    const from = (page - 1) * PER_PAGE
    const count = Math.max(0, Math.min(PER_PAGE, total - from))
    return new Response(JSON.stringify(makeItems(from, count)), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }) as typeof fetch
}

async function main(): Promise<void> {
  console.log(`== 场景：MOCK_MODE=${process.env.MOCK_MODE} ==\n`)

  // 前提断言：这是**真实分支**的自检。跑成 mock 的话 fetchStarred 会直接返回假数据，
  // 下面每条都会"通过"，但什么都没验到——所以先把这条钉死。
  check('跑在真实模式（否则分页分支根本不会执行）', process.env.MOCK_MODE === 'false')

  // ---------- 0) 没有 token 时给的是可读错误，而不是空列表 ----------
  {
    const calls: number[] = []
    installFetch(0, calls)
    let message = ''
    try {
      await github.fetchStarred()
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    check('没有 token 时抛可读错误', message.includes('GitHub Token'), message)
    check('没有 token 时一个请求都不发', calls.length === 0, `${calls.length} 次`)
  }

  // 后面几条都需要一个 token：keyring 不可用 → 只存内存，不落盘
  await store.saveToken('ghp_selfcheck_token')
  check('token 已就位（否则下面的断言全是空跑）', (await store.hasToken()) === true)

  // ---------- 1) 超过 300 条时要继续翻页（这就是这次修掉的东西） ----------
  {
    const calls: number[] = []
    installFetch(450, calls)
    const repos = await github.fetchStarred()
    check('450 条收藏能全部读到（旧实现在 300 条处截断）', repos.length === 450, `${repos.length} 条`)
    check(
      '翻了 5 页，且按 1..5 顺序翻',
      calls.join(',') === '1,2,3,4,5',
      calls.join(',')
    )
    check('第 5 页只返回 50 条（说明不满一页就停，不是按固定页数硬翻）', calls.length === 5)
    const first = repos[0]
    const last = repos[repos.length - 1]
    check(
      '按 starred_at 倒序（最晚 Star 的排最前）',
      new Date(first.starred_at).getTime() > new Date(last.starred_at).getTime(),
      `${first.full_name} → ${last.full_name}`
    )
    check(
      '字段照常映射（topics 缺省补空数组、latest_release 固定 null）',
      first.topics.length === 0 && first.latest_release === null && first.language === 'TypeScript'
    )
    check(
      '不预设 ai_summary / ai_category / local（这三个字段必须留给调用方保留）',
      !('ai_summary' in first) && !('ai_category' in first) && !('local' in first)
    )
  }

  // ---------- 2) 正好 300 条：不能多翻一页把最后一页吞掉，也不能少读 ----------
  {
    const calls: number[] = []
    installFetch(300, calls)
    const repos = await github.fetchStarred()
    check('正好 300 条时一条不少', repos.length === 300, `${repos.length} 条`)
    check('正好 300 条时会多探一页（第 4 页返回 0 条后停）', calls.join(',') === '1,2,3,4', calls.join(','))
  }

  // ---------- 3) 空收藏：一次请求就够，返回空数组而不是报错 ----------
  {
    const calls: number[] = []
    installFetch(0, calls)
    const repos = await github.fetchStarred()
    check('没有 Star 时返回空数组（不是错误）', repos.length === 0)
    check('空收藏只请求一次', calls.join(',') === '1', calls.join(','))
  }

  // ---------- 4) 撞上阀门：仍会截断，但必须留下痕迹 ----------
  {
    const calls: number[] = []
    installFetch(MAX_PAGES * PER_PAGE + 500, calls)
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(' '))
    }
    let repos: Awaited<ReturnType<typeof github.fetchStarred>> = []
    try {
      repos = await github.fetchStarred()
    } finally {
      console.warn = origWarn
    }
    check(
      `撞上限时返回 ${MAX_PAGES} 页（${MAX_PAGES * PER_PAGE} 条）`,
      repos.length === MAX_PAGES * PER_PAGE,
      `${repos.length} 条`
    )
    check('撞上限时请求次数正好是页数上限', calls.length === MAX_PAGES, `${calls.length} 次`)
    check(
      '撞上限时必须留一条 warn（截断不能悄悄发生）',
      warns.some((w) => w.includes('上限') && w.includes('不完整')),
      warns.join(' | ') || '没有任何 warn'
    )
  }

  // ---------- 5) 上游报错要变成可读错误，而不是把半截列表当成成功 ----------
  {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'Bad credentials' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })) as typeof fetch
    let message = ''
    try {
      await github.fetchStarred()
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    check('401 翻成人话（Token 无效 / 过期）', message.includes('Token'), message)
  }

  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
