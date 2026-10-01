// 用法：node scripts/selfcheck/dashboard.mjs
// 目的：脱离 Electron 直接验证 Dashboard 用到的两个聚合口径，不需要开窗口。
//   A. 趋势图 / 「本周新增」的 UTC 分桶是否与主进程 report.ts 完全一致（7 个连续 key）
//   B. 语言饼图的扇区数是否符合「取前 8 + 其余合并成其它」的规则
// 打印结果人工对照即可，不写断言、不接入 CI。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DAY = 86_400_000
const here = dirname(fileURLToPath(import.meta.url))
const repos = JSON.parse(readFileSync(join(here, '..', '..', 'mock-data.json'), 'utf8')).repos

/** 与 src/main/report.ts 的 dateKey 逐字一致 */
const dateKey = (d) => d.toISOString().slice(0, 10)

// ---------- A. UTC 分桶 ----------
const now = new Date()
const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

const trend = {}
for (let i = 6; i >= 0; i--) trend[dateKey(new Date(todayStart - i * DAY))] = 0
for (const r of repos) {
  const k = dateKey(new Date(r.starred_at))
  if (k in trend) trend[k] += 1
}

const keys = Object.keys(trend)
console.log('== A. 近 7 天 UTC 分桶（趋势图 x 轴）==')
console.log('key 个数:', keys.length, '(应为 7)')
console.log('key 连续:', keys.every((k, i) => i === 0 || new Date(k) - new Date(keys[i - 1]) === DAY))
console.log('x 轴标签:', keys.map((k) => k.slice(5)).join(' , '))
console.log('每日新增:', keys.map((k) => trend[k]).join(' , '))
console.log('窗口内合计:', Object.values(trend).reduce((a, b) => a + b, 0))

// 「本周新增」统计卡：>= todayStart - 6*DAY
const windowStart = todayStart - 6 * DAY
const recent = repos.filter((r) => {
  const t = new Date(r.starred_at).getTime()
  return Number.isFinite(t) && t >= windowStart
}).length
console.log('统计卡「本周新增」:', recent, '(应与窗口内合计相同)')

// ---------- B. 语言聚合 ----------
const counts = new Map()
for (const r of repos) {
  const k = r.language ?? '未知'
  counts.set(k, (counts.get(k) ?? 0) + 1)
}
const sorted = [...counts.entries()]
  .map(([name, value]) => ({ name, value }))
  .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))

const MAX = 8
const slices =
  sorted.length <= MAX
    ? sorted
    : [
        ...sorted.slice(0, MAX),
        { name: '其它', value: sorted.slice(MAX).reduce((s, x) => s + x.value, 0) }
      ]

console.log('\n== B. 语言饼图聚合 ==')
console.log('去重后的 key 数:', sorted.length, '(mock 为 9 种语言 + 未知 = 10)')
console.log('饼图扇区数:', slices.length, '(应为 9 = 前 8 + 其它)')
console.log(slices.map((s) => `${s.name}:${s.value}`).join('  '))
console.log('扇区合计:', slices.reduce((a, b) => a + b.value, 0), '(应等于仓库总数', repos.length, ')')

// ---------- C. 语言下拉选项数 ----------
const langs = [...new Set(repos.map((r) => r.language).filter((l) => l !== null))]
console.log('\n== C. 语言下拉 ==')
console.log('真实语言选项数:', langs.length, '(不含「全部语言」，mock 应为 9)')

// ---------- D. 7 个分类逐个统计 ----------
const CATS = ['AI/ML', '前端', '后端', 'DevOps', '工具', '学习资源', '其他']
console.log('\n== D. 分类筛选（每个都应有结果）==')
for (const c of CATS) {
  console.log(`  ${c}: ${repos.filter((r) => r.ai_category === c).length}`)
}
