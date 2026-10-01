import { useEffect, useMemo, useRef, useState } from 'react'
import { AI_CATEGORIES } from '@shared/types'
import { useRepoStore } from '../../store/repoStore'
import {
  DEFAULT_FILTERS,
  HEALTH_OPTIONS,
  REPO_SORTS,
  languageOption,
  type CategoryFilter,
  type HealthFilter,
  type LanguageFilter,
  type RepoSort
} from '../../lib/repoQuery'
import { Button } from '../common/Button'
import { Input } from '../common/Input'
import { Select } from '../common/Select'

/** 搜索防抖延迟：太短会让 store 频繁更新，太长会让输入感觉迟钝 */
const KEYWORD_DEBOUNCE_MS = 200

/**
 * 搜索框 + 语言筛选 + 分类筛选 + 活跃度筛选 + 只看已 clone + 排序 + 重置。
 *
 * ⚠️ 搜索框不能直接把 value 绑到 filters.keyword：
 * store 每次更新都会让受控输入重渲染，光标会跳到末尾。
 * 所以这里用本地 state 做即时值，再防抖 200ms 同步到 store。
 *
 * 「只看未知语言」原来是个补不了的洞（filters.language 是 `string | null`，
 * null 已被约定为"全部语言"，没有第三个态可用）。现在 language 换成了显式的
 * 'all' | 'unknown' | `name:xxx` 三态，这个选项才落得下来。
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
    keyword !== '' ||
    filters.language !== DEFAULT_FILTERS.language ||
    filters.category !== DEFAULT_FILTERS.category ||
    filters.onlyCloned ||
    filters.health !== DEFAULT_FILTERS.health ||
    // 排序也必须算进来：只看排序变过就该能一键回到默认顺序
    filters.sort !== DEFAULT_FILTERS.sort

  function reset(): void {
    lastPushedKeyword.current = ''
    setKeyword('')
    // 拷一份再写进 store：DEFAULT_FILTERS 是常量，直接传引用会让后续的
    // setFilters({...}) 合并写进同一个对象，把常量本身改掉
    setFilters({ ...DEFAULT_FILTERS })
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
        value={filters.language}
        onChange={(e) => setFilters({ language: e.target.value as LanguageFilter })}
        aria-label="语言筛选"
      >
        <option value="all">全部语言</option>
        {languages.map((l) => (
          <option key={l} value={languageOption(l)}>
            {l}
          </option>
        ))}
        {/* 放在列表末尾而不是紧跟「全部语言」：它是个例外情况，
            不该插在正常语言名称中间打乱扫读 */}
        <option value="unknown">未知语言</option>
      </Select>

      {/* 分类也是三态：全部分类 / 7 个真分类 / 未分类。'all' 与 'uncategorized'
          都是保留值；AiCategory 是封闭枚举，撞不上（语言那边取值域是任意字符串，
          所以才必须加 name: 前缀）。
          「未分类」放在末尾，与语言那边同理：它是个例外情况，不该插在正常分类
          中间打乱扫读。 */}
      <Select
        value={filters.category}
        onChange={(e) => setFilters({ category: e.target.value as CategoryFilter })}
        aria-label="分类筛选"
      >
        <option value="all">全部分类</option>
        {AI_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="uncategorized">未分类</option>
      </Select>

      <Select
        value={filters.health}
        onChange={(e) => setFilters({ health: e.target.value as HealthFilter })}
        aria-label="活跃度筛选"
      >
        {HEALTH_OPTIONS.map((h) => (
          <option key={h.value} value={h.value}>
            {h.label}
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

      <label className="ml-auto flex items-center gap-1.5 text-sm text-fg-muted">
        排序
        <Select
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as RepoSort })}
          aria-label="排序方式"
        >
          {REPO_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>

      <Button size="sm" variant="ghost" onClick={reset} disabled={!isDirty}>
        重置
      </Button>
    </div>
  )
}
