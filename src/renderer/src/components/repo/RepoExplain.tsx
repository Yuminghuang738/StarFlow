import { useEffect, useState } from 'react'
import type { Repo } from '@shared/types'
import { call } from '../../lib/api'
import { cn } from '../../lib/cn'

/**
 * 「AI 解释」：一句话说清这个仓库是干什么的。
 *
 * 复用既有两条通道（github:fetchReadme → ai:summarize），**不加新通道**：
 * summarizePrompt 要的就是「用一句中文总结这个开源项目的用途和亮点」，
 * 与这里的诉求是同一件事，没必要为它再造一条 IPC。
 *
 * 三条刻意为之的约定：
 *   1. **点一次才请求一次**。列表里几十张卡片，进页面就自动解释等于几十次网络 + 几十次
 *      AI 调用，额度会瞬间见底。与「为你推荐」页不进页面就自动搜是同一条理由。
 *   2. **结果缓存到模块级 Map**。列表会因筛选/排序重新挂载卡片，缓存掉了才能不重复请求；
 *      仓库已有的 ai_summary（AI 补全跑过）直接当缓存用，一次请求都不发。
 *   3. **失败用 call()（它会弹 toast）而不是 unwrap()**，这里只补一行就地说明——
 *      与 repoStore 的约定一致：toast 归 store/API 层，组件内不重复弹。
 *      三条失败分支都必须**就地留字**（不要把 text 留空：那样这一行看起来与没点过
 *      毫无区别，而 toast 3 秒就没了），并且留下之后按钮要变成「重试」——
 *      "可以稍后再试"这句提示只有真能再试才算数。
 */

/** full_name → 已生成的一句话解释。模块级，跨卡片重挂载存活 */
const explainCache = new Map<string, string>()

type Status = 'idle' | 'loading' | 'done' | 'error'

export function RepoExplain({ repo }: { repo: Repo }): React.JSX.Element {
  // 已有 AI 补全摘要的仓库直接当缓存用；否则看这次会话里有没有解释过
  const known = repo.ai_summary?.trim() || explainCache.get(repo.full_name) || ''
  const [text, setText] = useState(known)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('idle')

  // ⚠️ 只在第一次渲染取 known 是不够的。列表行按 key={repo.id} 复用，跑完
  // 「AI 补全分类」之后 repo 会换成带 ai_summary 的新对象，但组件实例不重挂，
  // text 会一直停在 ''——那行明明已经有摘要了，按钮却还写着「AI 解释」，
  // 点下去还会再抓一次 README、再调一次 AI（这条通道本来就是"点一次请求一次"，
  // 白花的额度是实打实的）。这里只做**单向**同步：补全结果填进空位，
  // 绝不覆盖用户已经点出来（或在飞的）内容。
  useEffect(() => {
    if (known === '') return
    setText((cur) => (cur === '' ? known : cur))
  }, [known])

  async function explain(): Promise<void> {
    // 已有内容：纯粹是展开/收起，不再发请求。
    // ⚠️ 但 error 态除外：那时 text 里存的是**失败说明**（"AI 这次没给出解释，
    // 可以稍后再试"），不是解释内容。如果这里一并被当成"有内容"短路掉，那句
    // "可以稍后再试"就成了空话——按钮只会把错误说明收起来，根本重试不了，
    // 用户唯一的出路是切走页面再切回来。所以出错之后这个按钮必须能再发一次请求。
    if (text !== '' && status !== 'error') {
      setOpen((v) => !v)
      return
    }

    setStatus('loading')
    setOpen(true)
    try {
      const readme = await call(window.api.github.fetchReadme(repo.full_name))
      if (readme === null) {
        // 与下面两条失败分支一样，就地留一句话：只弹 toast 的话，3 秒之后
        // 这一行看起来跟"没点过"完全一样。
        setStatus('error')
        setText('没能读到这个仓库的 README，看右上角的提示了解原因。')
        return
      }
      // README 太短说明大概率是空文件或占位，主进程的 summarize 也会直接返回空串
      if (readme.trim().length < 30) {
        setStatus('error')
        setText('这个仓库的 README 太短，AI 无从解释。')
        return
      }
      const summary = await call(window.api.ai.summarize(readme))
      if (summary === null || summary.trim() === '') {
        setStatus('error')
        setText('AI 这次没给出解释，可以稍后再试。')
        return
      }
      explainCache.set(repo.full_name, summary)
      setText(summary)
      setStatus('done')
    } catch (e) {
      // call() 已经把可读错误弹成 toast，这里只留排查日志 + 一行就地提示
      console.error('[RepoExplain] 解释失败', repo.full_name, e)
      setStatus('error')
      setText('解释失败，看右上角的提示了解原因。')
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void explain()}
        aria-expanded={open && text !== ''}
        disabled={status === 'loading'}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] transition-colors',
          status === 'loading'
            ? 'cursor-wait text-fg-subtle'
            : 'text-fg-muted hover:border-primary/40 hover:bg-primary/10 hover:text-primary'
        )}
      >
        <span aria-hidden>✦</span>
        {/* error 态下 text 装的是失败说明，标签得说"重试"而不是"收起解释"——
            否则用户会以为自己点开的是一段解释 */}
        {status === 'loading'
          ? '解释中…'
          : status === 'error'
            ? '重试'
            : text
              ? open
                ? '收起解释'
                : 'AI 解释'
              : 'AI 解释'}
      </button>

      {open && text !== '' ? (
        <p
          className={cn(
            'mt-1.5 border-l-2 pl-2.5 text-xs leading-relaxed',
            status === 'error' ? 'border-warning/50 text-fg-subtle' : 'border-primary/40 text-fg-muted'
          )}
        >
          {text}
        </p>
      ) : null}
    </div>
  )
}
