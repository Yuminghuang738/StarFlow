import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepoStore } from '../store/repoStore'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { EmptyState } from '../components/common/EmptyState'
import { LanguagePie } from '../components/charts/LanguagePie'
import { StarTrendChart } from '../components/charts/StarTrendChart'
import { formatStars, languageColor } from '../components/repo/repoFormat'
import {
  ACTIVE_WINDOW_DAYS,
  RECENT_WINDOW_DAYS,
  STALE_WINDOW_DAYS,
  buildAiDigest,
  computeCollectionStats,
  isRealCategory,
  UNCATEGORIZED_LABEL,
  type CollectionStats
} from '../lib/collectionStats'
import { unwrap, ipcErrorMessage } from '../lib/api'
import { filtersFor, languageOption, type RepoFilters } from '../lib/repoQuery'
import { cn } from '../lib/cn'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'
import { useNav } from '../components/layout/NavContext'
import type { Repo } from '@shared/types'

/**
 * 自动生成画像失败之后，同一份摘要至少隔这么久才会在"再次进入本页"时重试。
 *
 * 60 秒是个手感值，不是精确的：它要足够长到让人不会因为来回切两次板块就连撞两次墙，
 * 又要足够短到"刚才是网络抖动、现在想再试一次"不用等太久。真正的重试入口是那个按钮，
 * 这里只是别让自动行为变成骚扰。
 */
const AUTO_ANALYSIS_RETRY_MS = 60_000

/**
 * 收藏总览：统计卡片 + 分布条形图 + 图表 + 亮点。
 *
 * 全部数字来自 lib/collectionStats.ts 的纯函数（同输入同输出、时间口径统一为 UTC 日历天），
 * 页面只负责渲染——这里**不**做计算，也**不**调 load()：初始加载已经提到 App.tsx 里
 * 全局跑一次了，总览和管理页各留一份就是双重拉取 + 双重 prune IPC。
 *
 * 可点的卡片/条形（下钻）跳到收藏管理页并带上对应筛选。**必须整份覆盖筛选器**，
 * 见 drill() 里的说明。
 *
 * ⚠️ 「近 N 天新增」与图表共用**同一扇窗**（RECENT_WINDOW_DAYS），与周报页那张
 * 「本周新增 Star」共用的是**同一套 UTC 口径、但不是同一扇窗**：后者按日历周
 * （周一 00:00 UTC 起）算，本页是含今天在内的滚动 N 天。所以本页的文案一律说
 * 「近 N 天」，绝不写「本周」。改这里之前先看 report.ts 与 collectionStats.ts 的文件头。
 */
export function Overview(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const setFilters = useRepoStore((s) => s.setFilters)
  // 只有空态用得上：一条数据都没有时，得先分清是"读失败"还是"确实没同步过"。
  // 订阅 error 是必要的——读取失败时 repos 不变（保持上一次读到的那份，
  // 也可能是空数组），只有 error 会变，页面得靠它才知道该显示哪一半。
  // ⚠️ 读 loadError 而不是 error：后者是"任何操作最近一次的失败"，Star / Clone
  // 失败也会往里写，拿它当"列表为什么是空的"的判据会把两件事张冠李戴。
  const loadError = useRepoStore((s) => s.loadError)
  const load = useRepoStore((s) => s.load)
  // current：本页是保活的（切走只是 display:none），AI 收藏画像要判断"我现在是不是
  // 可见"，只能问这个上下文——组件自己察觉不到"我又被切回来了"。
  const { goTo, current } = useNav()

  /**
   * 下钻：整份替换筛选器（而不是合并），然后跳到收藏管理页。
   *
   * ⚠️ 必须整份替换。用户在管理页可能留着上次的搜索词或语言筛选，
   * 若只 patch 一个字段，卡片上写着 12、点进去却只有 3 条——数字对不上，
   * 而页面上没有任何东西提示"还叠着别的条件"。filtersFor 就是这条约定本身，
   * 单独放进 lib 是为了能让自检断言它（页面里的闭包断言不到）。
   */
  function drill(patch: Partial<RepoFilters>): void {
    setFilters(filtersFor(patch))
    goTo('manage')
  }

  /**
   * 分类分布里那一行的点击处理。
   *
   * 真分类直接当筛选值用；「未分类」不行——collectionStats 给它的桶名是
   * '未分类'，而筛选态叫 'uncategorized'，两者是不同的值域，必须显式映射一次。
   * 把桶名直接当筛选值传下去的话，filterRepos 会拿它去和 r.ai_category 严格相等
   * 比较，筛出空列表：点一下"未分类 12"，列表空了。
   *
   * 单独抽成函数还有一个类型上的原因：`isRealCategory(b.name) ? () => drill(...)`
   * 这种写法里被收窄的是**属性路径** b.name，TS 不会把它带进闭包（属性随时可能被改），
   * category 那格会退回 string、编译不过。换成普通参数 name（全程不重新赋值）就保得住。
   */
  function byCategory(name: string): (() => void) | undefined {
    if (isRealCategory(name)) return () => drill({ category: name })
    if (name === UNCATEGORIZED_LABEL) return () => drill({ category: 'uncategorized' })
    return undefined
  }

  // 时钟与统计一起算进同一个 useMemo：纯函数仍然显式接收 now（自检可以喂固定时间），
  // 而时间戳作为**计算结果的一部分**返回，就不会出现「依赖数组里有 repos、函数体里
  // 没用到 repos」这种被 exhaustive-deps 判为多余依赖的写法。
  const snapshot = useMemo(() => {
    const at = Date.now()
    return { at, stats: computeCollectionStats(repos, at) }
  }, [repos])
  const { at: now, stats } = snapshot

  // —— AI 收藏画像 ——
  //
  // **进「收藏总览」就自动生成，不用手动点**（用户明确要求的）。但"自动"不等于
  // "每次切回来都重新生成"——那会白烧用户的额度与钱。所以下面那份决策是**幂等**的：
  // 同一份摘要已经有画像了就不动；刚试过没成的也不立刻重试（见 AUTO_ANALYSIS_RETRY_MS）。
  // 手动按钮保留：摘要没变又想重写一段时，它是唯一的入口。
  const [analysis, setAnalysis] = useState<{ text: string; hint: string } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  /** 单飞：自动触发与手动点击走同一个函数，两个请求同时在飞只会白烧一次额度 */
  const analysisBusyRef = useRef(false)
  /**
   * 上一次**尝试**用的摘要与时刻。注意是"尝试"而不是"成功"：失败的摘要也要记住，
   * 否则每次切回本页都会拿同一份数据再撞一次墙（没配 Key 时尤其明显）。
   */
  const lastAttemptRef = useRef<{ digest: string; at: number } | null>(null)

  async function generateAnalysis(): Promise<void> {
    if (analysisBusyRef.current) return
    analysisBusyRef.current = true
    setAnalyzing(true)
    const digest = buildAiDigest(stats, now)
    lastAttemptRef.current = { digest, at: Date.now() }
    try {
      // 主进程保证不抛错：未配置 / 失败都以 { text: '', hint } 返回
      setAnalysis(await unwrap(window.api.ai.analyzeCollection(digest)))
    } catch (e) {
      // 走到这里只可能是 IPC 本身出了问题（主进程没起来之类），仍然给一行人话
      setAnalysis({ text: '', hint: ipcErrorMessage(e) })
    } finally {
      analysisBusyRef.current = false
      setAnalyzing(false)
    }
  }

  /**
   * 「要不要自动生成」的判据。挂在**每次渲染都刷新**的 ref 上，由下面那个 effect 调用。
   *
   * 为什么绕这一下：判据要用到 analysis / stats / now / repos（都是渲染期的值）。
   * 直接写进 effect 的话，依赖数组得把这几个全拉进来，于是每次数据变化都重跑一遍；
   * 与 GithubLoginCard 里 onAuthChangeRef 是同一个手法。
   */
  const autoAnalysisRef = useRef<() => void>(() => {})
  useEffect(() => {
    autoAnalysisRef.current = (): void => {
      // 没有数据就没有画像可谈，也不该白花一次额度
      if (repos.length === 0) return
      if (analysisBusyRef.current) return
      const digest = buildAiDigest(stats, now)
      const last = lastAttemptRef.current
      const sameData = last !== null && last.digest === digest
      // 这份摘要已经有画像了 → 不动。切回来一次就重新生成一次，用户是看不见的，
      // 账单上是看得见的。
      if (sameData && analysis !== null && analysis.text !== '') return
      // 刚拿这份摘要试过、没成（没配 Key / 网络失败 / 限频）→ 缓一缓再说。
      // 刻意不"每次进来都重试"：没配 Key 的人每切一次板块就撞一次墙；真想再试的人
      // 手边就是那个「生成画像」按钮，不必替他反复试。
      if (sameData && last !== null && Date.now() - last.at < AUTO_ANALYSIS_RETRY_MS) return
      void generateAnalysis()
    }
  })

  /**
   * 触发时机：**在本页可见时**，板块切回本页、或数据换了一份（同步 / 补全回来之后
   * repos 是整份替换的）——两者都会让上面那份判据重跑，而判据本身是幂等的。
   *
   * 刻意不做"进入沿"判定（Manage 那边做，因为那里是真的要发网络请求）：本页首屏就是
   * 默认板块（App.tsx 的 DEFAULT_TAB），那时数据还没加载到，光看"进入沿"会一次都不触发，
   * 用户得先切走再切回来才有画像——那正是他要我们改掉的行为。
   */
  useEffect(() => {
    if (current !== 'overview') return
    if (repos.length === 0) return
    autoAnalysisRef.current()
  }, [current, repos])

  if (repos.length === 0) {
    // 空态分两种，而且给用户的下一步动作正好相反。曾经它们长得一模一样：
    // 读盘失败也会显示「还没有同步过 Star → 去配 Token」，于是用户去重配 Token、
    // 重新同步，而真正的问题（本地库读不出来）一直没被说出来。
    if (loadError !== null) {
      return (
        <PageContainer>
          <HeroHeader stats={stats} onShowUncategorized={() => drill({ category: 'uncategorized' })} />
          <EmptyState
            title="读取本地数据失败"
            description={`${loadError}——这不代表你的收藏是空的，是这一次没读到。`}
            action={
              <Button size="sm" variant="primary" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        </PageContainer>
      )
    }
    return (
      <PageContainer>
        <HeroHeader stats={stats} onShowUncategorized={() => drill({ category: 'uncategorized' })} />
        <EmptyState
          title="还没有同步过 Star"
          description="到「设置」页配好 GitHub Token，再到「收藏管理」点一次同步，这里就会长出图表"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <HeroHeader stats={stats} onShowUncategorized={() => drill({ category: 'uncategorized' })} />

      {/* 统计卡片：8 项。信息量对比只有 4 项时翻了一倍，且每项都补了一句参照文案。
          带 onClick 的会下钻到收藏管理页（卡片右下角有"去处理 →"的提示，
          不然用户看不出它能点）。仍然不可点的是「AI 已分类」「语言数」「主题标签」：
          它们数出来的都不是"一批仓库的条数"（分别是全部已分类的合计、去重后的语言
          种数、去重后的 topic 数），凑不出一个条数恰好等于它的筛选，点了就是撒谎。 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="仓库总数"
          value={stats.total}
          hint={`总星标 ${formatStars(stats.totalStars)}`}
          onClick={() => drill({})}
        />
        {/* 这张卡**不能叫「本周新增」**：recent7 是"含今天在内往回数 7 个 UTC 日历日"，
            周三时它已经跨到上周去了。周报页另有一张真的按日历周（周一 00:00 UTC 起）算的
            「本周新增 Star」，两者只有恰好周日才相等——同一个词指两扇不同的窗，
            用户对不上账只会以为哪里坏了。同页的折线图标题用的就是「近 N 天」，
            这张卡现在跟它一致。
            下钻走的是 onlyRecent，与这个数字共用 collectionStats 的 starredBucket，
            且是同一扇窗——卡片写 5、点进去就必须是 5 条。 */}
        <StatCard
          label={`近 ${RECENT_WINDOW_DAYS} 天新增`}
          value={stats.recent7}
          hint={trendHint(stats.recent7, stats.prev7)}
          tone={stats.recent7 > 0 ? 'up' : 'flat'}
          onClick={() => drill({ onlyRecent: true })}
        />
        {/* 「AI 已分类」仍然不可点：它数的是**所有**分类过的仓库，而 category 筛选
            一次只能选一个分类，点进去必然只剩一小撮——卡片写 N、点进去 M，就是撒谎。
            真正可行动的入口是它的补集「未分类」：下面分类分布的最后一行，
            以及 hero 区那句「还有 N 个未分类」，两处都能筛出恰好 N 条。 */}
        <StatCard
          label="AI 已分类"
          value={stats.categorized}
          hint={`${percent(stats.categorized, stats.total)}，${stats.uncategorized} 个待补全`}
        />
        {/* 「语言数」不可点：它是一个**去重后的类别数**，不是条数，没有对应的筛选。
            想看某个语言，下面「语言分布」里点那一行。 */}
        <StatCard label="语言数" value={stats.languageCount} hint={`平均 ${formatStars(stats.avgStars)} 星`} />
        <StatCard
          label="已 Clone"
          value={stats.cloned}
          hint={`Fork 过 ${stats.forked} 个`}
          onClick={() => drill({ onlyCloned: true })}
        />
        <StatCard
          label="近期活跃"
          value={stats.activeRecently}
          // 天数从常量拼出来：这两句提示与筛选下拉里那两个选项是同一件事的两种说法，
          // 各自写死「90 天」「一年」的话，改了阈值就开始三处一起撒谎
          hint={`${ACTIVE_WINDOW_DAYS} 天内有过提交`}
          tone={stats.activeRecently > 0 ? 'up' : 'flat'}
          onClick={() => drill({ health: 'active' })}
        />
        <StatCard label="主题标签" value={stats.topicCount} hint="去重后的 topic 数" />
        <StatCard
          label="可能已停更"
          value={stats.stale}
          hint={
            stats.unknownPush > 0
              ? `另有 ${stats.unknownPush} 个拿不到提交时间`
              : `${STALE_WINDOW_DAYS} 天以上没有提交`
          }
          tone={stats.stale > stats.total / 3 ? 'warn' : 'flat'}
          onClick={() => drill({ health: 'stale' })}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="语言分布" subtitle={`Top ${stats.topLanguages.length}，按仓库数，点一行可下钻`} />
          <div className="mt-3 space-y-2.5">
            {stats.topLanguages.map((b) => (
              <BarRow
                key={b.name}
                name={b.name}
                count={b.count}
                ratio={b.ratio}
                color={languageColor(b.name)}
                onClick={() => drill({ language: languageOption(b.name) })}
              />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle title="AI 分类分布" subtitle="7 个固定分类各占多少，点一行可下钻" />
          <div className="mt-3 space-y-2">
            {stats.categories.map((b) => (
              <BarRow
                key={b.name}
                name={b.name}
                count={b.count}
                ratio={b.ratio}
                // 未分类用中性灰：它不是一个分类，别让它抢走分类色的注意力
                color={isRealCategory(b.name) ? categoryColor(b.name) : undefined}
                muted={!isRealCategory(b.name)}
                compact
                // 「未分类」也能点了：byCategory 把桶名映射成保留态 'uncategorized'，
                // 筛出来恰好是 stats.uncategorized 条。这行是整页最可行动的数字。 */}
                onClick={byCategory(b.name)}
              />
            ))}
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LanguagePie />
        <StarTrendChart />
      </section>

      {/* AI 收藏画像：把上面那些数字交给模型解读成一段人话。
          数据摘要由本地算好再传（见 buildAiDigest），模型只负责解读、不负责统计。 */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-fg">AI 收藏画像</h2>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              把上面的统计交给 AI，解读你的收藏口味与倾向
            </p>
          </div>
          <Button
            size="sm"
            variant={analysis === null ? 'primary' : 'ghost'}
            loading={analyzing}
            onClick={() => void generateAnalysis()}
          >
            {analyzing ? '生成中…' : analysis === null ? '生成画像' : '重新生成'}
          </Button>
        </div>

        <div className="mt-3">
          {analyzing && analysis === null ? (
            <div className="space-y-2" aria-busy>
              {/* 骨架高度贴近真实输出（120~200 字约 3 行） */}
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'h-4 animate-pulse rounded bg-surface-2',
                    i === 2 ? 'w-2/3' : 'w-full'
                  )}
                />
              ))}
            </div>
          ) : analysis === null ? (
            // 正常路径下这一句几乎看不到（进页面就会自动生成）；它出现在：数据还没加载到、
            // 或上一次生成的摘要已经过期。所以措辞不能写"点按钮开始"，而要说明白
            // "这事是自动的，按钮是补一个手动入口"。
            <p className="text-sm text-fg-subtle">
              会根据你的语言分布、分类偏好和活跃度自动写一段点评；如果想立刻重写一段，点「生成画像」。
            </p>
          ) : analysis.text ? (
            <p className="text-sm leading-relaxed text-fg-muted">{analysis.text}</p>
          ) : (
            <p className="text-sm text-fg-subtle">{analysis.hint}</p>
          )}
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="高频主题" subtitle={`全部 ${stats.topicCount} 个标签里出现最多的`} />
          {stats.topTopics.length === 0 ? (
            <p className="mt-3 text-sm text-fg-subtle">这批仓库都没有 topic 标签。</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {stats.topTopics.map((t) => (
                <span
                  key={t.name}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-fg-muted"
                >
                  {t.name}
                  <span className="tabular-nums text-fg-subtle">{t.count}</span>
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="最热收藏" subtitle="你 Star 过的仓库里星标最多的" />
          {stats.topRepo === null ? (
            <p className="mt-3 text-sm text-fg-subtle">还没有数据。</p>
          ) : (
            <TopRepoCard repo={stats.topRepo} />
          )}
        </Card>
      </section>
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* 局部组件                                                            */
/* ------------------------------------------------------------------ */

function HeroHeader({
  stats,
  onShowUncategorized
}: {
  stats: CollectionStats
  onShowUncategorized: () => void
}): React.JSX.Element {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5">
      {/* 这一层渐变光斑是整页唯一的装饰性用色，压得很淡：太浓会和图表抢注意力 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-accent opacity-[0.14] blur-3xl"
      />
      {/* 标题区复用全局的 PageHeader，只是套在这张 hero 卡里：
          这样图标徽章、标题字号、副标题、右侧操作区的对齐方式与其它页面完全一致。
          光斑那层是 absolute 的，所以这里要包一层 relative 把它压到底下。 */}
      <div className="relative">
        <PageHeader
          tab="overview"
          title="收藏总览"
          subtitle={
            <>
              你已经收藏了 <span className="font-medium text-primary">{stats.total}</span> 个仓库
              {stats.totalStars > 0 ? (
                <>
                  ，一共{' '}
                  <span className="font-medium text-fg">{formatStars(stats.totalStars)}</span> 颗星
                </>
              ) : null}
            </>
          }
          actions={
            // 这行以前是纯文字"可到「收藏管理」跑一次 AI 补全"——告诉用户有个入口，
            // 却没把他送过去。现在它本身就是那个入口。
            stats.uncategorized > 0 ? (
              <button
                type="button"
                onClick={onShowUncategorized}
                className="rounded-md text-xs text-primary transition-colors hover:text-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                还有 {stats.uncategorized} 个未分类 · 去补全 →
              </button>
            ) : undefined
          }
        />
      </div>
    </section>
  )
}

function TopRepoCard({ repo }: { repo: Repo }): React.JSX.Element {
  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 block rounded-lg border border-border bg-surface-2/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="truncate text-sm font-medium text-fg">{repo.full_name}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
        <span className="font-medium text-primary">★ {formatStars(repo.stargazers_count)}</span>
        {repo.language === null ? null : (
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: languageColor(repo.language) }}
              aria-hidden
            />
            {repo.language}
          </span>
        )}
      </div>
      {repo.description === null ? null : (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-subtle">
          {repo.description}
        </p>
      )}
    </a>
  )
}

/**
 * 统计卡。传了 onClick 就变成按钮并显示"去处理 →"——不加这行提示，
 * hover 之外看不出它能点（卡片本来就有一点点上浮效果，区分不出来）。
 */
function StatCard({
  label,
  value,
  hint,
  tone = 'flat',
  onClick
}: {
  label: string
  value: number
  hint?: string
  tone?: 'up' | 'warn' | 'flat'
  onClick?: () => void
}): React.JSX.Element {
  const body = (
    <Card
      className={cn(
        // h-full：可点的卡片里多了一行「去处理 →」（它只是 opacity-0，仍然占位），
        // 不给 h-full 的话同一行里可点与不可点的卡片会差一个行高，边框对不齐。
        'h-full min-w-0 transition-transform duration-200',
        // 可点的卡片上浮得明显一点，与纯展示的卡片区分开
        onClick ? 'group hover:-translate-y-0.5 hover:border-primary/40' : 'hover:-translate-y-0.5'
      )}
    >
      <div
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'up' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-fg'
        )}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-fg-muted">{label}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-fg-subtle">{hint}</div> : null}
      {onClick ? (
        <div className="mt-1.5 text-[11px] text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          去处理 →
        </div>
      ) : null}
    </Card>
  )

  if (!onClick) return body
  return (
    <button
      type="button"
      onClick={onClick}
      // w-full text-left：button 在网格里默认不撑满、且文字居中，两个都要改掉。
      // 圆角/边框交给里面的 Card，这里只做命中区域。
      className="h-full w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {body}
    </button>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-medium text-fg">{title}</h2>
      <span className="text-[11px] text-fg-subtle">{subtitle}</span>
    </div>
  )
}

/**
 * 分布条的一行。传了 onClick 就整行可点（下钻到收藏管理）。
 * 计数本身就是"这批仓库有多少个"，所以点它跳过去的列表条数必须与它一致——
 * drill() 整份替换筛选器就是在保这件事。
 */
function BarRow({
  name,
  count,
  ratio,
  color,
  muted = false,
  compact = false,
  onClick
}: {
  name: string
  count: number
  ratio: number
  color?: string
  muted?: boolean
  compact?: boolean
  onClick?: () => void
}): React.JSX.Element {
  const width = `${Math.round(ratio * 100)}%`
  const inner = (
    <>
      <span className={cn('w-24 shrink-0 truncate', muted ? 'text-fg-subtle' : 'text-fg-muted')}>
        {name}
      </span>
      {/* 条底始终画出来，0 值也能看出「这一栏是空的」而不是渲染坏了 */}
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width, background: color ?? '#64748b' }}
        />
      </span>
      <span className="w-8 shrink-0 text-right tabular-nums text-fg-muted">{count}</span>
    </>
  )

  const base = cn('flex items-center gap-2', compact ? 'text-xs' : 'text-sm')
  if (!onClick) return <div className={base}>{inner}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        'w-full rounded-md text-left transition-colors hover:bg-surface-2/60',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
      )}
    >
      {inner}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* 文案小工具                                                          */
/* ------------------------------------------------------------------ */

function percent(part: number, whole: number): string {
  if (whole <= 0) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

/**
 * 近 N 天与再往前 N 天的对比文案；前一个窗口为 0 时不显示「+∞%」那种废话。
 *
 * 措辞统一说「前 N 天」而不是「上周」：prev7 是"把这扇滚动窗整体往前挪 7 个日历日"，
 * 它同样不是日历周（见 collectionStats 文件头）。写「上周」的话，周三看到的
 * "上周"其实是从上周一到这周一，用户按日历去核对又是一笔对不上的账。
 */
function trendHint(current: number, previous: number): string {
  const win = RECENT_WINDOW_DAYS
  if (previous === 0) return current > 0 ? `前 ${win} 天还没有新增` : `前 ${win} 天也没有新增`
  const diff = current - previous
  if (diff === 0) return `与前 ${win} 天持平`
  const pct = Math.round((Math.abs(diff) / previous) * 100)
  return diff > 0 ? `比前 ${win} 天多 ${pct}%` : `比前 ${win} 天少 ${pct}%`
}

/**
 * 7 个分类的固定色。取的是「语义大体对得上」的一组（AI 偏紫、前端偏青、后端偏蓝…），
 * 与图表里的调色板无关——这张表只用来给条形着色，稳定比好看重要。
 */
const CATEGORY_COLORS: Record<string, string> = {
  'AI/ML': '#a78bfa',
  前端: '#22d3ee',
  后端: '#60a5fa',
  DevOps: '#fbbf24',
  工具: '#94a3b8',
  学习资源: '#4ade80',
  其他: '#64748b'
}

function categoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? '#64748b'
}
