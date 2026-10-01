import type { Repo } from '@shared/types'

/**
 * components/repo/ 下各仓库展示组件共用的展示用纯函数。
 *
 * 单独成文件的理由：RepoRow 与 RepoActions 都要用到相对时间，
 * 如果一边定义一边 import 会形成 RepoRow ⇄ RepoActions 的循环依赖。
 *
 * formatStars / formatRelative 的实现已经收到 lib/format.ts（此前这里和 lib/api.ts
 * 各有一份、规则不一样，同一个仓库在两个页面上会显示两个数）。这里 re-export，
 * 让本文件原有的 import 点（RepoRow / RepoActions / RecommendRepoCard / Overview）
 * 一行都不用改。
 */

export { formatRelative, formatStars } from '../../lib/format'

/** 未知 / 无语言时统一用的灰（Tailwind slate-500） */
const SLATE_500 = '#64748b'

/** 常见语言的官方色，保证同一语言在任何一行里颜色都稳定 */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Java: '#b07219',
  Kotlin: '#a97bff',
  Swift: '#f05138',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Shell: '#89e051',
  Dart: '#00b4ab',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  SCSS: '#c6538c',
  Lua: '#000080',
  Zig: '#ec915c',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Scala: '#c22d40',
  Perl: '#0298c3',
  R: '#198ce7',
  Jupyter: '#da5b0b',
  'Jupyter Notebook': '#da5b0b',
  Dockerfile: '#384d54',
  Makefile: '#427819',
  Nix: '#7e7eff'
}

/** 兜底调色板：语言名不在映射表里时按名字哈希取一个，保证"同一语言颜色稳定" */
const FALLBACK_PALETTE = [
  '#7dd3fc',
  '#a5b4fc',
  '#f0abfc',
  '#fca5a5',
  '#fdba74',
  '#fcd34d',
  '#86efac',
  '#5eead4',
  '#93c5fd',
  '#c4b5fd'
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** 语言 → 色块颜色。null（未知语言）固定灰色 */
export function languageColor(language: string | null): string {
  if (language === null) return SLATE_500
  const known = LANGUAGE_COLORS[language]
  if (known !== undefined) return known
  return FALLBACK_PALETTE[hashString(language) % FALLBACK_PALETTE.length] ?? SLATE_500
}

/** mock 数据里有 2 条 language 为 null，图表与下拉统一记为「未知」 */
export function languageKeyOf(repo: Repo): string {
  return repo.language ?? '未知'
}
