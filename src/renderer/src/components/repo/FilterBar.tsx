import { useEffect, useMemo, useRef, useState } from 'react'
import { AI_CATEGORIES, type AiCategory } from '@shared/types'
import { useRepoStore, type RepoFilters } from '../../store/repoStore'
import { Button } from '../common/Button'
import { Input } from '../common/Input'
import { Select } from '../common/Select'

const EMPTY_FILTERS: Partial<RepoFilters> = {
  keyword: '',
  language: null,
  category: null,
  onlyCloned: false
}

/** 搜索防抖延迟：太短会让 store 频繁更新，太长会让输入感觉迟钝 */
const KEYWORD_DEBOUNCE_MS = 200

/**
 * 搜索框 + 语言筛选 + 分类筛选 + 只看已 clone + 重置。
 *
 * ⚠️ 搜索框不能直接把 value 绑到 filters.keyword：
 * store 每次更新都会让受控输入重渲染，光标会跳到末尾。
 * 所以这里用本地 state 做即时值，再防抖 200ms 同步到 store。
 *
 * ⚠️ 语言下拉只列真实出现过的语言，不提供「未知语言」选项：
 * filters.language 的类型是 `string | null`，而 null 已经被约定为「全部语言」，
 * filterRepos 又用严格相等比较，所以「只看未知语言」这个筛选态在现有契约里无法表达
 * （硬塞一个 '__unknown__' 哨兵值只会筛出空列表）。待 P6 确认后再补。
 */
export function FilterBar(): React.JSX.Element {
  const repos = useRepoStore((s) => s.repos)
  const filters = useRepoStore((s) => s.filters)
  const setFilters = useRepoStore((s) => s.setFilters)

  const [keyword, setKeyword] = useState(filters.keyword)
  // 记录"最后一次由本组件写入 store 的关键词"，用来区分外部重置与用户输入
  const lastPushedKeyword = useRef(filters.keyword)

  // 把本地即时值防抖同步给 store
  useEffect(() => {
    if (keyword === lastPushedKeyword.current) return
    const timer = setTimeout(() => {
      lastPushedKeyword.current = keyword
      setFilters({ keyword })
    }, KEYWORD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [keyword, setFilters])

  // 外部改动（「重置」、空列表里的重置按钮、其它页面改筛选）要能同步回输入框
  useEffect(() => {
    if (filters.keyword === lastPushedKeyword.current) return
    lastPushedKeyword.current = filters.keyword
    setKeyword(filters.keyword)
  }, [filters.keyword])

  const languages = useMemo(
    () =>
      [...new Set(repos.map((r) => r.language).filter((l): l is string => l !== null))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [repos]
  )

  const isDirty =
    keyword !== '' || filters.language !== null || filters.category !== null || filters.onlyCloned

  function reset(): void {
    lastPushedKeyword.current = ''
    setKeyword('')
    setFilters(EMPTY_FILTERS)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜索仓库名或描述"
        aria-label="搜索仓库"
        className="w-64 max-w-full"
      />

      <Select
        value={filters.language ?? ''}
        onChange={(e) => setFilters({ language: e.target.value === '' ? null : e.target.value })}
        aria-label="语言筛选"
      >
        <option value="">全部语言</option>
        {languages.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </Select>

      <Select
        value={filters.category ?? ''}
        onChange={(e) =>
          setFilters({ category: e.target.value === '' ? null : (e.target.value as AiCategory) })
        }
        aria-label="分类筛选"
      >
        <option value="">全部分类</option>
        {AI_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>

      <label className="flex select-none items-center gap-1.5 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={filters.onlyCloned}
          onChange={(e) => setFilters({ onlyCloned: e.target.checked })}
          className="h-3.5 w-3.5 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        只看已 clone
      </label>

      <Button size="sm" variant="ghost" onClick={reset} disabled={!isDirty}>
        重置
      </Button>
    </div>
  )
}
