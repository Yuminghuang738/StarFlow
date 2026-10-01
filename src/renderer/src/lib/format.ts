/**
 * 展示用的数字 / 时间格式化（纯函数：只依赖入参，不碰 React、不碰 Node、不碰 window.api）。
 *
 * 为什么单独成一个模块：这两个函数原本**各有两份实现**——`lib/api.ts` 里一份、
 * `components/repo/repoFormat.ts` 里一份，而两边的规则并不一样：
 * 星标数一份是「一律保留一位小数」，另一份是「≥10 就取整」，单位还分了 `M` / `m` 大小写；
 * 相对时间一份把恰好 30 天算作「30 天前」，另一份算作日期，非法入参一个回日期、一个回
 * 「时间未知」。于是同一个仓库可以在收藏管理页显示 `★ 22k`、在周报页显示 `★ 21.5k`——
 * 两个页面各说各话，而用户没有任何办法判断哪个是真的。收成一处是唯一解。
 *
 * 两个原位置（`lib/api.ts`、`components/repo/repoFormat.ts`）都从这里 re-export，
 * 所以所有调用点的 import 一行都不用改，公共导出面也没少。
 */

/**
 * 星标数：≥1000 显示 `1.2k`，≥1e6 显示 `1.2m`，其余原样。
 * 超过 10 个单位量级（≥10k）之后取整：`21.5k` 那个 `.5` 既不精确也不好看。
 */
export function formatStars(count: number): string {
  if (count >= 1_000_000) {
    const m = count / 1_000_000
    return `${m >= 10 ? Math.round(m) : m.toFixed(1)}m`
  }
  if (count >= 1000) {
    const k = count / 1000
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`
  }
  return String(count)
}

/**
 * ISO 字符串 → 「3 天前」。
 * 口径：入参是 UTC 的 ISO 8601（与 Repo.starred_at / forked_at 一致），
 * 这里只做时间差计算，不涉及时区换算。
 * 超过 30 天改用绝对日期：再往后「间隔 8 个月」这种说法没有信息量。
 */
export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  // 不用 Number.isNaN：NaN 和 ±Infinity 在这里一样没法算差值
  if (!Number.isFinite(t)) return '时间未知'

  const diff = Date.now() - t
  // 时钟偏差导致的"未来时间"统一按刚刚处理，不显示负数
  if (diff < 60_000) return '刚刚'

  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`

  return iso.slice(0, 10)
}
