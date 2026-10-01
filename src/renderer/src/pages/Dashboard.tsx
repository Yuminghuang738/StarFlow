import { useCallback, useEffect, useMemo, useState } from 'react'
import { AI_CATEGORIES, type AiCategory } from '@shared/types'
import { useRepoStore, filterRepos } from '../store/repoStore'
import { Card } from '../components/common/Card'
import { Button } from '../components/common/Button'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

export function Dashboard(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const loading = useRepoStore((s) => s.loading)
  const filters = useRepoStore((s) => s.filters)
  const setFilters = useRepoStore((s) => s.setFilters)
  const load = useRepoStore((s) => s.load)
  const unstar = useRepoStore((s) => s.unstar)
  const fork = useRepoStore((s) => s.fork)
  const clone = useRepoStore((s) => s.clone)
  const openDir = useRepoStore((s) => s.openDir)

  // 注意不要写成 useRepoStore((s) => s.visibleRepos())：visibleRepos() 每次返回新数组，
  // zustand v5 的 useSyncExternalStore 用严格相等比较快照，会判定值一直在变而无限重渲染。
  // 正确做法是订阅它依赖的两个切片，再用同一个纯函数算（filters 因此是真实的依赖）。
  const visible = useMemo(() => filterRepos(repos, filters), [repos, filters])

  const [pendingUnstar, setPendingUnstar] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const languages = useMemo(
    () =>
      [...new Set(repos.map((r) => r.language).filter((l): l is string => l !== null))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [repos]
  )

  const onCancelUnstar = useCallback(() => setPendingUnstar(null), [])
  const onConfirmUnstar = useCallback(() => {
    const fullName = pendingUnstar
    setPendingUnstar(null)
    if (fullName !== null) void unstar(fullName)
  }, [pendingUnstar, unstar])

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Star 管理</h1>
        <span className="text-sm text-slate-400">
          {loading ? '加载中…' : `共 ${repos.length} 个仓库，当前显示 ${visible.length} 个`}
        </span>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={filters.keyword}
          onChange={(e) => setFilters({ keyword: e.target.value })}
          placeholder="搜索仓库名或描述"
          className="w-64 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-sky-500"
        />
        <select
          value={filters.language ?? ''}
          onChange={(e) => setFilters({ language: e.target.value === '' ? null : e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm outline-none focus:border-sky-500"
        >
          <option value="">全部语言</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={filters.category ?? ''}
          onChange={(e) =>
            setFilters({ category: e.target.value === '' ? null : (e.target.value as AiCategory) })
          }
          className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm outline-none focus:border-sky-500"
        >
          <option value="">全部分类</option>
          {AI_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex select-none items-center gap-1.5 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={filters.onlyCloned}
            onChange={(e) => setFilters({ onlyCloned: e.target.checked })}
          />
          只看已 clone
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {visible.length === 0 ? (
          <Card className="text-center text-sm text-slate-400">
            {repos.length === 0 ? '还没有数据，去设置页同步' : '没有符合条件的仓库'}
          </Card>
        ) : (
          visible.map((r) => (
            <Card key={r.full_name}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <a
                    href={r.html_url}
                    className="font-medium text-sky-400 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.full_name}
                  </a>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                    {r.description ?? '（无描述）'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{r.language ?? '未知语言'}</span>
                    <span>★ {r.stargazers_count.toLocaleString('en-US')}</span>
                    {r.ai_category ? (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                        {r.ai_category}
                      </span>
                    ) : null}
                    {r.local?.cloned_path ? (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                        已 clone
                      </span>
                    ) : null}
                    {r.local?.forked_full_name ? (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                        Fork → {r.local.forked_full_name}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="danger" onClick={() => setPendingUnstar(r.full_name)}>
                    取消 Star
                  </Button>
                  <Button size="sm" onClick={() => void fork(r.full_name)}>
                    Fork
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void clone(r.full_name)}>
                    Clone
                  </Button>
                  {r.local?.cloned_path ? (
                    <Button size="sm" variant="ghost" onClick={() => void openDir(r.local!.cloned_path!)}>
                      打开目录
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <ConfirmDialog
        open={pendingUnstar !== null}
        danger
        title="取消 Star？"
        description={
          pendingUnstar === null
            ? undefined
            : `将把 ${pendingUnstar} 从你的 Star 列表里移除，本地列表也会同步删除。`
        }
        confirmText="取消 Star"
        onConfirm={onConfirmUnstar}
        onCancel={onCancelUnstar}
      />
    </div>
  )
}
