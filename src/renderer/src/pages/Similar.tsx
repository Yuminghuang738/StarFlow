import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRepoStore } from '../store/repoStore'
import { useRecommendStore } from '../store/recommendStore'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { SkeletonCard, SKELETON_COUNT } from '../components/common/SkeletonCard'
import { RecommendRepoCard } from '../components/repo/RecommendRepoCard'
import { languageColor } from '../components/repo/repoFormat'
import { PageContainer, PageHeader } from '../components/layout/PageLayout'
import type { RecommendProfile } from '@shared/recommend'

/**
 * 为你推荐：不要求用户挑种子，直接按**整份收藏**的画像推。
 *
 * 为什么改掉「选一个仓库当参照」：那等于把「我到底喜欢什么」这个问题又推回给了用户，
 * 而答案早就写在他的收藏列表里。现在主进程把几百条收藏压成画像（主要语言 / 高频主题 /
 * 主分类），再按画像拼几条查询去搜——用户什么都不用选，进页面就有东西看。
 * 画像会显示在页面上，让推荐**有理由**，而不是一堆来路不明的卡片。
 *
 * ⚠️ 这里**刻意**与本项目其它页面的约定反着来：进页面就自动搜一次。
 * 别的页面（发现仓库、收藏画像）都坚持"显式按钮"，理由是别让用户点一下侧边栏就
 * 消耗一次额度。这个页面例外，因为"推荐"本身就是被动推送的东西——
 * 让用户先点一下「给我推荐」才给看，等于把推送变成了查询。
 * 代价（一次最多 3 条串行搜索）用一个 autoRan 守住"每次会话只搜一次"，
 * 想换一批就点按钮，不会因为来回切页面反复耗配额。
 *
 * 主进程只用本地语料的信号，**不调 AI**，所以只要有 GitHub Token 就能用。
 */
export function Similar(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)

  const results = useRecommendStore((s) => s.forYouResults)
  const profile = useRecommendStore((s) => s.forYouProfile)
  const loading = useRecommendStore((s) => s.forYouLoading)
  const error = useRecommendStore((s) => s.forYouError)
  const offset = useRecommendStore((s) => s.forYouOffset)
  const loadForYou = useRecommendStore((s) => s.loadForYou)

  // StrictMode 下 effect 会跑两次，没有这个 ref 就会白搜一倍的量（配额很紧）。
  // 也顺带保证：切到别的板块再切回来（页面是保活的，不重新挂载）不会重搜。
  const autoRan = useRef(false)
  useEffect(() => {
    // 等 repos 到位再搜：画像来自收藏列表，列表还是空的时候搜出来的东西没有依据。
    // 这也是为什么依赖 repos.length 而不是只跑一次——首次挂载时列表可能还在加载。
    if (autoRan.current || repos.length === 0) return
    autoRan.current = true
    void loadForYou(0)
  }, [repos.length, loadForYou])

  if (repos.length === 0) {
    return (
      <PageContainer>
        <Header />
        <EmptyState
          title="还没有可以参照的收藏"
          description="先到「设置」页配好 GitHub Token，再到「收藏管理」同步一次你的 Star 列表，这里就会按你的口味推"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <Header profile={profile} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          loading={loading}
          onClick={() => void loadForYou(offset + 1)}
        >
          换一批
        </Button>
        {loading ? (
          <span className="text-xs text-fg-subtle">正在按你的画像搜…</span>
        ) : (
          <span className="text-xs text-fg-subtle">
            {profile === null ? '' : `只看 ${profile.starFloor} 星以上，避免搜出一堆空仓库`}
          </span>
        )}
      </div>

      {error === null ? null : (
        <Card className="border-danger/40">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <SkeletonCard key={`foryou-${i}`} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          title={error === null ? '这次没搜到合适的' : '推荐没拿到结果'}
          description={
            error === null
              ? '点「换一批」试试——它会错开画像里排后面的语言与主题再搜一次'
              : '先解决上面的报错（多半是 Token 或限频），再点「换一批」重试'
          }
        />
      ) : (
        <>
          <p className="text-xs text-fg-subtle">共 {results.length} 个，按与画像的贴合度排序</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {results.map((r) => (
                <motion.div
                  key={r.full_name}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  <RecommendRepoCard repo={r} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* 局部组件                                                            */
/* ------------------------------------------------------------------ */

function Header({ profile }: { profile?: RecommendProfile | null }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        tab="similar"
        title="为你推荐"
        subtitle="根据你收藏的全部仓库推荐——不用挑参照，进来看就行"
      />
      {profile === undefined || profile === null || profile.total === 0 ? null : (
        <ProfileBar profile={profile} />
      )}
    </div>
  )
}

/**
 * 画像条：把「凭什么推这些」摊开给用户看。
 *
 * 这不是装饰。推荐结果一旦给不出理由，用户就只能凭感觉信或不信；
 * 而这里的每一项（语言 / 主题 / 分类 / 星数地板）都真的参与了拼查询，
 * 说出来反而能帮他判断"是不是我想看的"——发现推偏了就知道该去补分类或标签。
 */
function ProfileBar({ profile }: { profile: RecommendProfile }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs">
      <span className="text-fg-subtle">
        基于你的 <span className="font-medium tabular-nums text-fg">{profile.total}</span> 个收藏
      </span>

      {profile.languages.length > 0 ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="text-fg-subtle">主要语言</span>
          {profile.languages.map((l) => (
            <span
              key={l}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-fg-muted"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: languageColor(l) }}
                aria-hidden
              />
              {l}
            </span>
          ))}
        </span>
      ) : null}

      {profile.topics.length > 0 ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="text-fg-subtle">高频主题</span>
          {profile.topics.map((t) => (
            <span
              key={t}
              className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary"
            >
              {t}
            </span>
          ))}
        </span>
      ) : null}

      {profile.category === null ? null : (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-fg-subtle">主分类</span>
          <span className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 text-fg-muted">
            {profile.category}
          </span>
        </span>
      )}
    </div>
  )
}
