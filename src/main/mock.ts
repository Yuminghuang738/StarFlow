// mock.ts 是全项目唯一的假数据源，所有业务模块的 Mock 分支都调这里。
// 严禁调用 octokit / openai / simple-git；严禁在本文件读写文件或数据库（那是 store.ts 的职责）。

import type { Repo, Release, Commit, AiCategory } from '@shared/types'
import mockData from '../../mock-data.json'

// mock-data.json 的 ai_category 被 TS 推断成宽泛的 string，这里收敛回契约类型
const seed = mockData.repos as Repo[]

// 模块级内存态列表：unstar / fork 都改这一份，所以刷新之后不会"复活"
let starred: Repo[] = structuredClone(seed)

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

function findRepo(fullName: string): Repo | undefined {
  return starred.find((r) => r.full_name === fullName)
}

function repoName(fullName: string): string {
  return fullName.split('/')[1] ?? fullName
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString()
}

const HEX = '0123456789abcdef'

function randomSha(): string {
  let sha = ''
  for (let i = 0; i < 7; i++) {
    sha += HEX[Math.floor(Math.random() * HEX.length)]
  }
  return sha
}

/** 基于 description / language 拼一句中文摘要，30 字以内 */
function buildSummary(repo: Repo): string {
  const lang = repo.language ?? '多语言'
  const desc = repo.description?.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  if (!desc) {
    return `${lang} 项目，文档齐全，上手成本低。`
  }
  const brief = desc.split(/\s+/).slice(0, 7).join(' ')
  return [...`${lang} 项目：${brief}`].slice(0, 29).join('')
}

/* ------------------------------------------------------------------ */
/* 13 个导出函数（11 个签名冻结见 docs/module-signatures.md，           */
/* mockSearch / mockStar 是 PR 4 为推荐功能补的）                       */
/* ------------------------------------------------------------------ */

export async function mockStarred(): Promise<Repo[]> {
  return structuredClone(starred)
}

export async function mockEnrich(repos: Repo[]): Promise<Repo[]> {
  // 模拟一点耗时，让前端的 loading 态看得见；不要真的调用任何 LLM
  await new Promise((resolve) => setTimeout(resolve, 15))
  return repos.map((repo) => ({
    ...repo,
    // 已有分类的保留（mock-data.json 里的分类是精心标定的，覆盖掉会破坏演示效果），
    // 只有缺分类时才用 mockClassify 推断
    ai_summary: repo.ai_summary ?? buildSummary(repo),
    ai_category: repo.ai_category ?? mockClassify(repo)
  }))
}

export async function mockReadme(fullName: string): Promise<string> {
  const repo = findRepo(fullName)
  const desc = repo?.description ?? '暂无简介'
  const lang = repo?.language ?? '多语言'
  const stars = repo?.stargazers_count ?? 0

  return `# ${fullName}

${desc}

这是一个使用 ${lang} 开发的开源项目，目前在 GitHub 上收获了 ${stars} 颗 Star。
以下内容为演示用示例文档，由 StarFlow 的 Mock 层生成。

## 安装

\`\`\`bash
git clone https://github.com/${fullName}.git
cd ${repoName(fullName)}
\`\`\`

## 使用

安装完成后，按照项目根目录的说明配置好依赖即可运行。
更多用法请参考仓库内的文档与示例代码。
`
}

export async function mockReleases(fullName: string): Promise<Release[]> {
  const tags = ['v1.2.3', 'v1.1.0', 'v1.0.0']
  return tags.map((tag, i) => ({
    tag_name: tag,
    name: tag,
    published_at: daysAgo((i + 1) * 30),
    html_url: `https://github.com/${fullName}/releases/tag/${tag}`
  }))
}

const COMMIT_MESSAGES = [
  'fix: 修复边界条件下的空指针问题',
  'feat: 新增数据导出功能',
  'docs: 更新 README 安装说明',
  'refactor: 拆分过长的函数',
  'chore: bump dev dependencies'
]

export async function mockCommits(fullName: string): Promise<Commit[]> {
  return COMMIT_MESSAGES.map((message, i) => {
    const sha = randomSha()
    return {
      sha,
      message,
      date: daysAgo(i + 1),
      html_url: `https://github.com/${fullName}/commit/${sha}`
    }
  })
}

export function mockUnstar(fullName: string): void {
  starred = starred.filter((r) => r.full_name !== fullName)
}

export function mockFork(fullName: string): Repo {
  const repo = findRepo(fullName)
  if (!repo) {
    throw new Error(`mockFork: 仓库不存在 ${fullName}`)
  }
  repo.local = {
    ...repo.local,
    forked_full_name: `starflow-demo/${repoName(fullName)}`,
    forked_at: new Date().toISOString()
  }
  return structuredClone(repo)
}

export async function mockSimilar(fullName: string): Promise<Repo[]> {
  const self = findRepo(fullName)
  const others = starred.filter((r) => r.full_name !== fullName)
  if (!self) {
    return structuredClone(others.slice(0, 4))
  }
  const related = others.filter(
    (r) => r.ai_category === self.ai_category || r.language === self.language
  )
  const rest = others.filter((r) => !related.includes(r))
  // 不足 4 条时用其他仓库补齐
  return structuredClone([...related, ...rest].slice(0, 4))
}

/**
 * 搜索（推荐功能的 Mock 分支）：在 mock-data.json 的语料里做关键词包含匹配。
 *
 * ⚠️ 命中后**换一个 owner**（`community-labs/xxx`）再返回，不是原样返回语料。
 * 原因：语料就是 mock 的「已 Star 列表」，而 store 在库空时会自动灌入同一份种子，
 * 于是 recommend.forQuery 的「已 Star 的不再推荐」会把结果整条过滤光——
 * MOCK_MODE 下推荐板块永远空着，演示时看着像功能没做。
 * 换成另一个 owner 正好模拟真实场景：搜到的是别人的、你还没 Star 的仓库。
 */
export function mockSearch(query: string, limit: number): Repo[] {
  // 查询串里带 GitHub 限定符（topic: / language: / stars:>=）时，只拿关键词部分去匹配
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t !== '' && !t.includes(':'))

  const hits = terms.length
    ? seed.filter((r) => {
        const hay =
          `${r.full_name} ${r.description ?? ''} ${r.language ?? ''} ${r.topics.join(' ')}`.toLowerCase()
        return terms.some((t) => hay.includes(t))
      })
    : seed

  return structuredClone(hits.slice(0, limit)).map((r) => {
    const name = repoName(r.full_name)
    return {
      ...r,
      // id 也要挪开，否则与列表里同 id 的卡片在 React 的 key 上会打架
      id: r.id + 900000,
      full_name: `community-labs/${name}`,
      html_url: `https://github.com/community-labs/${name}`,
      // 与真实分支一致：搜索结果拿不到「我什么时候 star 的」，用 pushed_at 占位，
      // 所以推荐卡片不渲染相对时间
      starred_at: r.pushed_at ?? '',
      latest_release: null
    }
  })
}

/**
 * Star（推荐功能的 Mock 分支）。语料里已有就返回它，否则造一条最小记录塞进内存列表——
 * 真实模式的 mockStar 是"真的加了一条"，这样刷新之后也能在管理页看到。
 */
export function mockStar(fullName: string): Repo {
  const existing = findRepo(fullName)
  if (existing) return structuredClone(existing)

  const now = new Date().toISOString()
  const repo: Repo = {
    id: Math.floor(Math.random() * 1_000_000_000),
    full_name: fullName,
    description: '（Mock 模式新加 Star 的演示仓库）',
    language: null,
    stargazers_count: 0,
    html_url: `https://github.com/${fullName}`,
    starred_at: now,
    topics: [],
    pushed_at: now,
    latest_release: null
  }
  starred = [repo, ...starred]
  return structuredClone(repo)
}

export function mockSummary(readme: string): string {
  const heading = readme.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''
  const name = heading.split('/').filter(Boolean).pop()
  if (!name) {
    return '项目提供开箱即用的核心能力，文档完整易上手。'
  }
  return [...`${name}：核心能力开箱即用，文档完整易上手。`].slice(0, 30).join('')
}

/* 固定映射表：结果必须稳定可复现，禁止用 Math.random 影响分类 */
const AI_ML_LANGUAGES = ['Python', 'Go', 'C++', 'C']
const AI_ML_KEYWORDS = [
  'transformers',
  'langchain',
  'ollama',
  'llama',
  'pytorch',
  'comfyui',
  'diffusion',
  'llm',
  'gpt',
  'neural',
  'tensor',
  'machine-learning'
]
const FRONTEND_LANGUAGES = ['JavaScript', 'TypeScript']
const FRONTEND_TOPIC_KEYWORDS = ['ui', 'react', 'vue', 'css']
const BACKEND_LANGUAGES = ['Go', 'Rust', 'C', 'Java']
const BACKEND_TOPIC_KEYWORDS = ['server', 'database', 'api']
const DEVOPS_TOPIC_KEYWORDS = ['docker', 'k8s', 'kubernetes', 'ci', 'cd']
const DEVOPS_NAME_KEYWORDS = ['docker', 'kubernetes', 'k8s']
const LEARNING_KEYWORDS = ['awesome', 'roadmap', 'course', 'interview', 'learn']

export function mockClassify(repo: Repo): AiCategory {
  const language = repo.language
  const name = repo.full_name.toLowerCase()
  const topics = repo.topics.map((t) => t.toLowerCase())

  const hasTopic = (list: readonly string[]): boolean => topics.some((t) => list.includes(t))
  const nameHas = (list: readonly string[]): boolean => list.some((k) => name.includes(k))

  // 1. AI/ML：语言是 Python/Go/C++/C 且名字命中 AI 关键词
  if (language && AI_ML_LANGUAGES.includes(language) && nameHas(AI_ML_KEYWORDS)) {
    return 'AI/ML'
  }

  // 2. 前端：JS/TS 且 topics 命中 ui/react/vue/css
  if (language && FRONTEND_LANGUAGES.includes(language) && hasTopic(FRONTEND_TOPIC_KEYWORDS)) {
    return '前端'
  }

  // 3. DevOps
  // 注意：这一条必须排在"后端"之前。kubernetes / docker 这类仓库语言大多是 Go，
  // 若先判后端，就会被"language 为 Go"这条规则全部吃掉，DevOps 分类永远为空。
  if (hasTopic(DEVOPS_TOPIC_KEYWORDS) || nameHas(DEVOPS_NAME_KEYWORDS)) {
    return 'DevOps'
  }

  // 4. 后端：Go/Rust/C/Java，或 topics 命中 server/database/api
  if ((language && BACKEND_LANGUAGES.includes(language)) || hasTopic(BACKEND_TOPIC_KEYWORDS)) {
    return '后端'
  }

  // 5. 学习资源
  if (hasTopic(LEARNING_KEYWORDS) || nameHas(LEARNING_KEYWORDS)) {
    return '学习资源'
  }

  // 6. 工具：其余有语言的
  if (language) {
    return '工具'
  }

  // 7. 其他：完全没有语言的
  return '其他'
}

export function mockReportSummary(repos: Repo[]): string {
  const week = repos.filter((r) => Date.now() - new Date(r.starred_at).getTime() < 7 * 86400000)
  const pool = week.length > 0 ? week : repos

  const langCount = new Map<string, number>()
  for (const r of pool) {
    const key = r.language ?? '未知'
    langCount.set(key, (langCount.get(key) ?? 0) + 1)
  }

  let topLang = '未知'
  let topLangCount = 0
  for (const [lang, count] of langCount) {
    if (count > topLangCount) {
      topLang = lang
      topLangCount = count
    }
  }

  const topRepo = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count)[0]

  const text =
    `本周新增 ${week.length} 个 Star，${topLang} 项目最多，共 ${topLangCount} 个。` +
    `其中 ${topRepo?.full_name ?? '—'} 以 ${topRepo?.stargazers_count ?? 0} Star 居首，值得重点关注。`

  return [...text].slice(0, 100).join('')
}

/**
 * 收藏画像的 mock 文案。
 *
 * 与 mockReportSummary 不同，这里**不从入参推导**内容：画像要的是「你的口味」这种
 * 聚合判断，mock 语料只有 31 条，编出来的结论看着像真的但其实和数据对不上——
 * 那比一句老实的话更糟。所以这里只回一段固定的示例文案，长度与真实输出相当，
 * 用来验证界面排版即可。
 */
export function mockCollectionAnalysis(): string {
  return (
    '你的收藏明显偏向能直接上手的工具与后端项目，语言集中在少数几个主力栈上，' +
    '看得出更在意「拿过来能不能用」，而不是「看起来有没有意思」。' +
    '不过有一批仓库收藏之后再没被碰过，可以挑几个真正用得上的 clone 到本地，' +
    '让收藏夹变成工作台。'
  )
}
