// 本地副本「落后追踪 + 快进更新」的自检。
//
// 跑法：node scripts/selfcheck/local-sync.mjs
//   （驱动器用 esbuild 打包本文件，把 electron / simple-git 换成 scripts/selfcheck/
//     下的桩，再按 SCENARIO 起子进程。）
//
// 三段，对应三种最容易出错的地方：
//   ① 纯函数（localSync.ts，不碰 git 也不碰磁盘）：判定顺序，以及"没查到就 null、
//      绝不用 0 冒充"这条铁律。好几个断言是**反向探针**——专门验证"差一点就说成
//      up-to-date"的那种情况没有发生。
//   ② 主流程（打桩 simple-git）：谁在什么时候被调用。这里最贵的两个错误是
//      **不该发的 fetch**（拒绝理由本地就能判定，没必要联网）和**不该执行的 merge**
//      （工作区脏或已分叉时动了用户的历史）。
//   ③ Mock 模式（MOCK_MODE=true）：假数据只能由 mock.ts 产生，simpleGit 一次都不碰。
//
// 真机上 git 的输出格式、网络故障的真实文案要靠人工验收——这层是假的。
// 本自检不接入 CI，与其它自检一致。
import { mkdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LocalState, Repo } from '../../src/shared/types'
import * as local from '../../src/main/local'
import { mockLocalSync } from '../../src/main/mock'
import {
  classifyLocalSync,
  decideUpdate,
  parseAheadBehind,
  type SyncProbe,
  type UpdateDecision
} from '../../src/main/localSync'
import { stub } from './simple-git-stub.mjs'

let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

function finish(): void {
  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** 每个场景一个干净目录，避免上一轮的残留影响"目录名不符""副本不在"这类断言 */
function freshBase(tag: string): string {
  const base = join(tmpdir(), `starflow-local-sync-${tag}-${process.pid}`)
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base, { recursive: true })
  return base
}

/**
 * 造一个"看起来像 git 工作树"的目录并返回**真实路径**。
 * realpath 是必须的：被测代码里有一道"目录名 == 仓库名"的闸门，比对的是解析后的
 * 真实路径；如果 /tmp 本身是符号链接，直接拿拼出来的路径比会假失败。
 */
function makeWorkTree(dir: string): string {
  mkdirSync(join(dir, '.git', 'objects'), { recursive: true })
  return realpathSync(dir)
}

/** 一个普通的空目录（没有 .git）。返回真实路径，理由同上 */
function makePlainDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return realpathSync(dir)
}

/**
 * 断言用的两个取值器。
 *
 * decideUpdate 返回的是判别式联合，直接 `.detail` 会编译不过（联合里有的成员没有
 * 这个字段）；用 as 硬转又会在"本来该是 fail 却是 update"时抛一个看不懂的类型错。
 * 这两个函数把那种情况变成一句可读的失败信息。
 */
function failDetail(decision: UpdateDecision): string {
  return decision.action === 'fail' ? decision.detail : `（不是失败，而是 ${decision.action}）`
}

function refuseKind(decision: UpdateDecision): string {
  return decision.action === 'refuse' ? decision.kind : `（不是拒绝，而是 ${decision.action}）`
}

function makeRepo(fullName: string, localState?: LocalState): Repo {
  return {
    id: 1,
    full_name: fullName,
    description: null,
    language: null,
    stargazers_count: 0,
    html_url: `https://github.com/${fullName}`,
    starred_at: '2026-01-01T00:00:00Z',
    topics: [],
    pushed_at: null,
    latest_release: null,
    local: localState
  }
}

function probe(over: Partial<SyncProbe> = {}): SyncProbe {
  return {
    pathExists: true,
    identityMatches: true,
    isGitWorktree: true,
    branch: 'main',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    dirty: false,
    fetchError: null,
    fatalError: null,
    ...over
  }
}

// ============================================================
// git 打桩：一份"脚本化"的 rev-parse / fetch / rev-list / status / merge
// ============================================================

interface GitScript {
  /** 当前分支；'HEAD' 表示游离 */
  branch?: string
  /** 跟踪分支；显式 null 表示 @{u} 解析不出来（没有跟踪分支） */
  upstream?: string | null
  /** fetch 抛这个错 */
  fetchError?: Error
  /** merge 抛这个错 */
  mergeError?: Error
  /**
   * 依次返回给 rev-list 的差异（左=领先，右=落后）；用完后重复最后一个。
   * 用序列而不是单值，是因为"更新"这条路上 rev-list 会被问三次：
   * 拒绝判定 → fetch 之后重算 → 收尾重探，三次的答案本来就该不同。
   */
  diffs?: string[]
  /** status --porcelain 的输出，非空即"脏" */
  porcelain?: string
  /** 读分支时抛这个错（用 ENOENT 模拟没装 git） */
  branchError?: Error
}

/** 装一份脚本，并清空调用记录——每个流程块开头调一次，断言就只看这一块 */
function installScript(o: GitScript = {}): void {
  let diffIndex = 0
  stub.rawCalls.length = 0
  stub.onRaw = ({ args }: { args: string[] }): string => {
    const cmd = args[0]
    // 顺序要紧：'@{u}' 那条也是 rev-parse，先判它
    if (cmd === 'rev-parse' && args.includes('@{u}')) {
      if (o.upstream === null) throw new Error("fatal: no upstream configured for branch 'main'")
      return `${o.upstream ?? 'origin/main'}\n`
    }
    if (cmd === 'rev-parse') {
      if (o.branchError) throw o.branchError
      return `${o.branch ?? 'main'}\n`
    }
    if (cmd === 'fetch') {
      if (o.fetchError) throw o.fetchError
      return ''
    }
    if (cmd === 'rev-list') {
      const diffs = o.diffs ?? ['0\t0']
      const value = diffs[Math.min(diffIndex, diffs.length - 1)]
      diffIndex += 1
      return `${value}\n`
    }
    if (cmd === 'status') return o.porcelain ?? ''
    if (cmd === 'merge') {
      if (o.mergeError) throw o.mergeError
      return ''
    }
    // 没准备却收到命令就是被测代码多打了东西，直接炸出来
    throw new Error(`桩没有准备这个命令：git ${args.join(' ')}`)
  }
}

/** 本块里跑过的某类命令（按顺序） */
function rawOf(cmd: string): string[][] {
  return stub.rawCalls.filter((c: { args: string[] }) => c.args[0] === cmd).map((c: { args: string[] }) => c.args)
}

function cmdList(): string {
  return stub.rawCalls.map((c: { args: string[] }) => c.args[0]).join(',')
}

// ============================================================
// 第一部分：纯函数
// ============================================================

function pureChecks(): void {
  console.log('---------- parseAheadBehind ----------')

  const ok1 = parseAheadBehind('0\t3')
  check(
    "parseAheadBehind('0\\t3') 切出领先/落后",
    ok1 !== null && ok1.ahead === 0 && ok1.behind === 3,
    JSON.stringify(ok1)
  )
  const ok2 = parseAheadBehind('  2 5\n')
  check(
    '前后空白照吃（git 的输出带换行）',
    ok2 !== null && ok2.ahead === 2 && ok2.behind === 5,
    JSON.stringify(ok2)
  )
  const ok3 = parseAheadBehind('0\t0')
  check('0/0 是合法值，不是"没拿到"', ok3 !== null && ok3.ahead === 0 && ok3.behind === 0)

  for (const bad of ['', '   ', '1', 'x\t3', '1\t2\t3', '-1\t2', '1.5\t2', 'null']) {
    check(`parseAheadBehind(${JSON.stringify(bad)}) → null（不猜）`, parseAheadBehind(bad) === null)
  }

  console.log('\n---------- classifyLocalSync：正常态 ----------')

  check('干净且无差异 → up-to-date', classifyLocalSync(probe()).state === 'up-to-date')
  check('落后 3 → behind', classifyLocalSync(probe({ behind: 3 })).state === 'behind')
  check('领先 2 → ahead', classifyLocalSync(probe({ ahead: 2 })).state === 'ahead')
  check('两头都有 → diverged', classifyLocalSync(probe({ ahead: 2, behind: 3 })).state === 'diverged')
  check(
    '落后 3 且工作区脏 → 仍是 behind（脏不改变落后这件事）',
    classifyLocalSync(probe({ behind: 3, dirty: true })).state === 'behind'
  )

  console.log('\n---------- classifyLocalSync：反向探针（最要紧的一组） ----------')

  const netFail = classifyLocalSync(
    probe({ fetchError: '无法连接远端仓库（请检查网络、代理或仓库权限）', ahead: null, behind: null })
  )
  check('fetch 失败 → error，而不是「已是最新」', netFail.state === 'error', netFail.state)
  check('fetch 失败 → 原因原样带出', netFail.detail === '无法连接远端仓库（请检查网络、代理或仓库权限）', String(netFail.detail))

  // 这一条是整套判定里最容易写错的地方：本地引用恰好显示"没有落后"，
  // 但那是**上次抓取时**的事实，此刻远端可能早已前进。宁可说检查失败。
  check(
    'fetch 失败但本地差异恰好是 0/0 → 仍是 error',
    classifyLocalSync(probe({ fetchError: '连不上', ahead: 0, behind: 0 })).state === 'error'
  )

  const unknownDiff = classifyLocalSync(probe({ ahead: null, behind: null }))
  check('差异读不到（且没抓到错）→ error', unknownDiff.state === 'error', unknownDiff.state)
  check('差异读不到 → 绝不说成 up-to-date', unknownDiff.state !== 'up-to-date')

  check(
    '目录名不符 → path-mismatch，而不是 up-to-date',
    classifyLocalSync(probe({ identityMatches: false })).state === 'path-mismatch'
  )
  check(
    '磁盘上没了 → missing-on-disk',
    classifyLocalSync(probe({ pathExists: false })).state === 'missing-on-disk'
  )
  check(
    '目录在但不是 git 工作树 → not-git',
    classifyLocalSync(probe({ isGitWorktree: false })).state === 'not-git'
  )
  check(
    '读分支失败 → error（且有原因）',
    classifyLocalSync(probe({ branch: null, fatalError: '读取分支失败：x' })).state === 'error'
  )
  check('游离 HEAD → detached', classifyLocalSync(probe({ branch: 'HEAD' })).state === 'detached')
  check(
    '没有跟踪分支 → no-upstream，而不是 up-to-date',
    classifyLocalSync(probe({ upstream: null, ahead: null, behind: null })).state === 'no-upstream'
  )

  console.log('\n---------- classifyLocalSync：顺序不许重排 ----------')

  check(
    '路径都没了压过一切（哪怕目录名也不符）',
    classifyLocalSync(probe({ pathExists: false, identityMatches: false, behind: 3 })).state ===
      'missing-on-disk'
  )
  check(
    '目录名不符压过 not-git',
    classifyLocalSync(probe({ identityMatches: false, isGitWorktree: false })).state ===
      'path-mismatch'
  )
  check(
    'fatalError 压过 behind：读状态失败时不许报落后数',
    classifyLocalSync(probe({ fatalError: '读取工作区状态失败：x', behind: 3 })).state === 'error'
  )
  check(
    'fetchError 压过「差异读不到」：说网络，不说解析',
    (classifyLocalSync(probe({ fetchError: '无法连接远端仓库', ahead: null, behind: null })).detail ??
      '').includes('无法连接远端仓库')
  )

  console.log('\n---------- decideUpdate ----------')

  const d1 = decideUpdate(probe({ behind: 3 }))
  check('落后且干净 → update', d1.action === 'update', d1.action)

  const d2 = decideUpdate(probe({ behind: 3, dirty: true }))
  check(
    '落后但有未提交改动 → refused-dirty',
    d2.action === 'refuse' && d2.kind === 'refused-dirty',
    JSON.stringify(d2)
  )
  check(
    'refused-dirty 的说明里点明"已保留你的修改"',
    d2.action === 'refuse' && d2.detail.includes('已保留'),
    d2.action === 'refuse' ? d2.detail : ''
  )

  // 分叉时快进**永远不可能**成功，先说"你有本地改动"会让人白忙一场
  const d3 = decideUpdate(probe({ ahead: 1, behind: 3, dirty: true }))
  check(
    '分叉压过 dirty',
    d3.action === 'refuse' && d3.kind === 'refused-diverged',
    JSON.stringify(d3)
  )
  check(
    '分叉压过"读不到工作区状态"',
    decideUpdate(probe({ ahead: 1, behind: 3, dirty: null })).action === 'refuse'
  )

  const d4 = decideUpdate(probe({ ahead: 2, behind: 0, dirty: true }))
  check('只领先、没有可拉的 → up-to-date（不谎报成一次被拒绝的更新）', d4.action === 'up-to-date', d4.action)

  const d5 = decideUpdate(probe({ behind: 0, dirty: true }))
  check('落后 0 且工作区脏 → 仍是 up-to-date（无事可做）', d5.action === 'up-to-date', d5.action)

  check(
    '落后且读不到工作区状态 → fail（不敢在不知道脏不脏的情况下 merge）',
    decideUpdate(probe({ behind: 3, dirty: null })).action === 'fail'
  )
  check(
    '差异读不到 → fail，且说的是差异',
    failDetail(decideUpdate(probe({ ahead: null, behind: null }))).includes('差异'),
    failDetail(decideUpdate(probe({ ahead: null, behind: null })))
  )
  check(
    'fetch 失败（探测结果里带着）→ fail 带网络原因',
    failDetail(decideUpdate(probe({ fetchError: '无法连接远端仓库', ahead: null, behind: null }))).includes(
      '无法连接远端仓库'
    )
  )

  const pathRefuse = decideUpdate(probe({ identityMatches: false }))
  check(
    '目录名不符 → refused-path（拒绝对不确定的目录动手）',
    refuseKind(pathRefuse) === 'refused-path',
    JSON.stringify(pathRefuse)
  )
  check(
    '副本不在 → refused-path',
    refuseKind(decideUpdate(probe({ pathExists: false }))) === 'refused-path'
  )
  check(
    '不是 git 工作树 → refused-path',
    refuseKind(decideUpdate(probe({ isGitWorktree: false }))) === 'refused-path'
  )
  check(
    '游离 HEAD → refused-detached',
    refuseKind(decideUpdate(probe({ branch: 'HEAD' }))) === 'refused-detached'
  )
  check(
    '没有跟踪分支 → refused-no-upstream',
    refuseKind(decideUpdate(probe({ upstream: null }))) === 'refused-no-upstream'
  )
}

// ============================================================
// 第二部分：主流程（打桩 git）
// ============================================================

async function checkFlows(): Promise<void> {
  console.log('\n---------- 检查：落后 / 领先 / 最新 ----------')

  const base = freshBase('check')
  const dir = makeWorkTree(join(base, 'Hello-World'))

  installScript({ diffs: ['0\t3'] })
  const behind = await local.checkLocalSync('octocat/Hello-World', dir)
  check('落后 3 → state=behind', behind.state === 'behind', behind.state)
  check('落后 3 → behind=3 / ahead=0', behind.behind === 3 && behind.ahead === 0, `${behind.ahead}/${behind.behind}`)
  check('检查带上了分支与跟踪分支', behind.branch === 'main' && behind.upstream === 'origin/main')
  check('检查带上了时间戳', typeof behind.checkedAt === 'string' && behind.checkedAt !== '')
  check('干净的工作区 → dirty=false', behind.dirty === false)
  check('检查时确实 fetch 了一次', rawOf('fetch').length === 1, cmdList())
  check('fetch 的是跟踪分支对应的 remote', rawOf('fetch')[0]?.[1] === 'origin', String(rawOf('fetch')[0]?.[1]))
  check(
    '所有 git 命令都打在副本目录上',
    stub.rawCalls.every((c: { baseDir: string | null }) => c.baseDir === dir),
    cmdList()
  )

  // 跟踪分支可能不是 origin（用户自己改过、或者是 fork）——按实际配置走，
  // 不拿 full_name 反推 URL，这是唯一诚实的答案
  installScript({ upstream: 'upstream/main', diffs: ['0\t1'] })
  const custom = await local.checkLocalSync('octocat/Hello-World', dir)
  check('跟踪分支是 upstream/main 时按其 remote 抓取', rawOf('fetch')[0]?.[1] === 'upstream', cmdList())
  check('这种仓库照样能给出落后数', custom.behind === 1, String(custom.behind))

  installScript({ diffs: ['0\t0'] })
  const latest = await local.checkLocalSync('octocat/Hello-World', dir)
  check('无差异 → up-to-date 且 behind=0', latest.state === 'up-to-date' && latest.behind === 0)

  installScript({ diffs: ['2\t0'] })
  const ahead = await local.checkLocalSync('octocat/Hello-World', dir)
  check('只领先 → ahead 且 ahead=2', ahead.state === 'ahead' && ahead.ahead === 2, ahead.state)

  console.log('\n---------- 检查：不该联网的情况 ----------')

  installScript({ branch: 'HEAD', diffs: ['0\t3'] })
  const detached = await local.checkLocalSync('octocat/Hello-World', dir)
  check('游离 HEAD → state=detached', detached.state === 'detached', detached.state)
  check('游离 HEAD → behind=null（不是 0）', detached.behind === null, String(detached.behind))
  check('游离 HEAD → 不发 fetch', rawOf('fetch').length === 0, cmdList())
  check('游离 HEAD → 连差异都不算', rawOf('rev-list').length === 0, cmdList())

  installScript({ upstream: null, diffs: ['0\t3'] })
  const noUp = await local.checkLocalSync('octocat/Hello-World', dir)
  check('没有跟踪分支 → no-upstream', noUp.state === 'no-upstream', noUp.state)
  check('没有跟踪分支 → behind=null', noUp.behind === null, String(noUp.behind))
  check('没有跟踪分支 → 不发 fetch', rawOf('fetch').length === 0, cmdList())

  console.log('\n---------- 检查：失败不许说成"最新" ----------')

  const netErr = new Error('fatal: unable to access https://github.com/x/y.git/: Could not resolve host: github.com')
  installScript({ fetchError: netErr, diffs: ['0\t3'] })
  const failed = await local.checkLocalSync('octocat/Hello-World', dir)
  check('抓取失败 → state=error', failed.state === 'error', failed.state)
  check('抓取失败 → 绝不说成 up-to-date', failed.state !== 'up-to-date')
  check('抓取失败 → behind=null（绝不拿旧引用算个数）', failed.behind === null, String(failed.behind))
  check('抓取失败 → 中文原因', (failed.detail ?? '').includes('无法连接远端仓库'), String(failed.detail))
  check('抓取失败 → 一条 rev-list 都不跑', rawOf('rev-list').length === 0, cmdList())

  installScript({ branchError: new Error('spawn git ENOENT') })
  const noGit = await local.checkLocalSync('octocat/Hello-World', dir)
  check('没装 git → state=error', noGit.state === 'error', noGit.state)
  check(
    '没装 git → 提示安装 git 并加入 PATH',
    (noGit.detail ?? '').includes('git') && (noGit.detail ?? '').includes('PATH'),
    String(noGit.detail)
  )

  console.log('\n---------- 检查：路径闸门，且一条 git 命令都不该跑 ----------')

  installScript()
  const mismatchDir = makePlainDir(join(freshBase('mismatch'), 'Something-Else'))
  const mismatch = await local.checkLocalSync('octocat/Hello-World', mismatchDir)
  check('目录名不符 → path-mismatch', mismatch.state === 'path-mismatch', mismatch.state)
  check('目录名不符 → 不碰 git', stub.rawCalls.length === 0, cmdList())

  installScript()
  const plainDir = makePlainDir(join(freshBase('plain'), 'Hello-World'))
  const notGit = await local.checkLocalSync('octocat/Hello-World', plainDir)
  check('目录在但不是 git 工作树 → not-git', notGit.state === 'not-git', notGit.state)
  check('不是 git 工作树 → 不碰 git', stub.rawCalls.length === 0, cmdList())

  installScript()
  const goneDir = join(freshBase('gone'), 'Hello-World')
  const gone = await local.checkLocalSync('octocat/Hello-World', goneDir)
  check('副本不在磁盘上 → missing-on-disk', gone.state === 'missing-on-disk', gone.state)
  check('副本不在 → 不碰 git', stub.rawCalls.length === 0, cmdList())
  check('副本不在 → 不抛错，结果编码在返回值里', gone.behind === null)

  console.log('\n---------- 更新：能快进的那条路 ----------')

  const upBase = freshBase('update')
  const upDir = makeWorkTree(join(upBase, 'Hello-World'))

  // rev-list 会被问三次：拒绝判定（落后 3）→ fetch 后重算（落后 3）→ 收尾重探（已同步）
  installScript({ diffs: ['0\t3', '0\t3', '0\t0'] })
  const out = await local.updateLocalClone('octocat/Hello-World', upDir)
  check('快进成功 → kind=updated', out.kind === 'updated', out.kind)
  check('快进成功 → pulled=本次拉进来的提交数', out.pulled === 3, String(out.pulled))
  check('快进成功 → 收尾重探已是 up-to-date', out.status?.state === 'up-to-date', String(out.status?.state))
  const order = stub.rawCalls.map((c: { args: string[] }) => c.args[0])
  const fetchAt = order.indexOf('fetch')
  const mergeAt = order.indexOf('merge')
  check('先 fetch 再 merge', fetchAt >= 0 && mergeAt > fetchAt, order.join(','))
  check(
    'merge 用的是 --ff-only @{u}（不生成合并提交）',
    JSON.stringify(rawOf('merge')[0]) === '["merge","--ff-only","@{u}"]',
    JSON.stringify(rawOf('merge')[0])
  )
  check('只 merge 一次', rawOf('merge').length === 1, String(rawOf('merge').length))
  check('merge 之前先确认过工作区干净', order.indexOf('status') < mergeAt, order.join(','))
  check(
    'fetch 之后重算过差异（不许拿检查时的旧数字当结论）',
    rawOf('rev-list').length >= 3,
    String(rawOf('rev-list').length)
  )

  console.log('\n---------- 更新：本地有改动 ----------')

  installScript({ diffs: ['0\t3'], porcelain: ' M src/a.ts\n?? 未跟踪.txt\n' })
  const dirty = await local.updateLocalClone('octocat/Hello-World', upDir)
  check('有未提交改动 → refused-dirty', dirty.kind === 'refused-dirty', dirty.kind)
  check('有未提交改动 → 一个 fetch 都不发（本地事实就够判了）', rawOf('fetch').length === 0, cmdList())
  check('有未提交改动 → 绝不 merge', rawOf('merge').length === 0, cmdList())
  check('有未提交改动 → pulled=0（没拉任何东西）', dirty.pulled === 0, String(dirty.pulled))
  check('有未提交改动 → 说清了"已保留你的修改"', (dirty.detail ?? '').includes('已保留'), String(dirty.detail))
  check(
    '被拒绝也回一份状态，界面能就地刷新徽章',
    dirty.status?.state === 'behind' && dirty.status?.dirty === true,
    JSON.stringify(dirty.status)
  )

  console.log('\n---------- 更新：已分叉 ----------')

  installScript({ diffs: ['2\t5'], porcelain: ' M src/a.ts\n' })
  const diverged = await local.updateLocalClone('octocat/Hello-World', upDir)
  check('分叉 → refused-diverged', diverged.kind === 'refused-diverged', diverged.kind)
  check('分叉 → 不 fetch', rawOf('fetch').length === 0, cmdList())
  check('分叉 → 不 merge', rawOf('merge').length === 0, cmdList())
  check(
    '分叉压过 dirty：说的是分叉，不是"你有本地改动"',
    (diverged.detail ?? '').includes('快进无法完成') && !(diverged.detail ?? '').includes('未提交'),
    String(diverged.detail)
  )

  console.log('\n---------- 更新：抓取之后才发现的坑 ----------')

  // 手快：检查时本地引用还看不到上游的新提交，fetch 之后才发现两边各有提交
  installScript({ diffs: ['0\t3', '2\t5'] })
  const late = await local.updateLocalClone('octocat/Hello-World', upDir)
  check('抓取后才发现分叉 → refused-diverged', late.kind === 'refused-diverged', late.kind)
  check('抓取后才发现分叉 → 仍然不 merge', rawOf('merge').length === 0, cmdList())

  installScript({ diffs: ['0\t3'], mergeError: new Error('fatal: Not possible to fast-forward, aborting.') })
  const race = await local.updateLocalClone('octocat/Hello-World', upDir)
  check('merge 报快进不可能 → refused-diverged 而不是通用错误', race.kind === 'refused-diverged', race.kind)
  check('merge 报快进不可能 → 提示可以重试', (race.detail ?? '').includes('重试'), String(race.detail))
  check('merge 报快进不可能 → 绝不谎报 updated', race.kind !== 'updated')

  installScript({ diffs: ['0\t3'], mergeError: new Error('fatal: 磁盘写满了') })
  const mergeFail = await local.updateLocalClone('octocat/Hello-World', upDir)
  check('其它 merge 失败 → kind=error', mergeFail.kind === 'error', mergeFail.kind)
  check('其它 merge 失败 → 中文前缀 + 原文', (mergeFail.detail ?? '').includes('快进失败'), String(mergeFail.detail))
  check('其它 merge 失败 → status=null（没有可信的新状态就不编一个）', mergeFail.status === null)

  installScript({ diffs: ['0\t3'], fetchError: netErr })
  const pullNetFail = await local.updateLocalClone('octocat/Hello-World', upDir)
  check('更新时抓取失败 → kind=error', pullNetFail.kind === 'error', pullNetFail.kind)
  check('更新时抓取失败 → 不 merge', rawOf('merge').length === 0, cmdList())
  check('更新时抓取失败 → 中文网络原因', (pullNetFail.detail ?? '').includes('无法连接远端仓库'), String(pullNetFail.detail))

  console.log('\n---------- 更新：无事可做与路径闸门 ----------')

  installScript({ diffs: ['0\t0'], porcelain: ' M src/a.ts\n' })
  const nothing = await local.updateLocalClone('octocat/Hello-World', upDir)
  check('没有可拉的提交 → up-to-date（不是"被拒绝的更新"）', nothing.kind === 'up-to-date', nothing.kind)
  check('没有可拉的提交 → 绝不 merge', rawOf('merge').length === 0, cmdList())

  installScript()
  const wrongNameDir = makePlainDir(join(freshBase('refuse'), 'Documents'))
  const pathRefuse = await local.updateLocalClone('octocat/Hello-World', wrongNameDir)
  check('目录名不符 → refused-path', pathRefuse.kind === 'refused-path', pathRefuse.kind)
  check('目录名不符 → 不碰 git', stub.rawCalls.length === 0, cmdList())
  check(
    '目录名不符 → 理由说的是名字不符，不是"副本不存在"',
    (pathRefuse.detail ?? '').includes('目录名与仓库名不符'),
    String(pathRefuse.detail)
  )

  installScript()
  const plainRefuseDir = makePlainDir(join(freshBase('refuse2'), 'Hello-World'))
  const notGitRefuse = await local.updateLocalClone('octocat/Hello-World', plainRefuseDir)
  check('不是 git 工作树 → refused-path', notGitRefuse.kind === 'refused-path', notGitRefuse.kind)
  check('不是 git 工作树 → 不碰 git', stub.rawCalls.length === 0, cmdList())

  installScript()
  const missingRefuse = await local.updateLocalClone(
    'octocat/Hello-World',
    join(freshBase('refuse3'), 'Hello-World')
  )
  check('副本不在 → refused-path', missingRefuse.kind === 'refused-path', missingRefuse.kind)
  check(
    '副本不在 → 状态如实说是 missing-on-disk',
    missingRefuse.status?.state === 'missing-on-disk',
    String(missingRefuse.status?.state)
  )

  console.log('\n---------- 批量检查：并发 3，互不拖累 ----------')

  const batchBase = freshBase('batch')
  const names = ['a/Alpha', 'b/Beta', 'c/Gamma', 'd/Delta', 'e/Epsilon', 'f/Zeta']
  const repos = names.map((n) => {
    const dirName = n.split('/')[1]
    const path = makeWorkTree(join(batchBase, dirName))
    return makeRepo(n, { cloned_path: path })
  })
  repos.push(makeRepo('g/None'))

  installScript({ diffs: ['0\t1'] })
  const inner = stub.onRaw
  let active = 0
  let peak = 0
  stub.onRaw = async (ctx: { baseDir: string | null; args: string[] }) => {
    active += 1
    peak = Math.max(peak, active)
    try {
      await sleep(10)
      return inner(ctx)
    } finally {
      active -= 1
    }
  }
  const statuses = await local.checkAllLocalSync(repos)
  check('批量检查给每个已 clone 仓库一条结果', statuses.length === 6, String(statuses.length))
  check(
    '没有 cloned_path 的仓库不参与',
    !statuses.some((s) => s.full_name === 'g/None'),
    statuses.map((s) => s.full_name).join(',')
  )
  check('并发峰值不超过 3（与 enrichRepos 同一约定）', peak <= 3, `peak=${peak}`)
  check('并发峰值确实到了 3（是并发在跑，不是排成一队）', peak === 3, `peak=${peak}`)
  check(
    '每条结果各归各的目录',
    new Set(stub.rawCalls.map((c: { baseDir: string | null }) => c.baseDir)).size === 6,
    String(new Set(stub.rawCalls.map((c: { baseDir: string | null }) => c.baseDir)).size)
  )

  // 单个仓库的坏结果不该拖垮整批：一条副本被删、其余照常出结果
  const partialBase = freshBase('partial')
  const okDir = makeWorkTree(join(partialBase, 'Alpha'))
  const errDir = makeWorkTree(join(partialBase, 'Beta'))
  installScript({ diffs: ['0\t4'] })
  const partial = await local.checkAllLocalSync([
    makeRepo('a/Alpha', { cloned_path: okDir }),
    makeRepo('b/Beta', { cloned_path: errDir }),
    makeRepo('c/Gamma', { cloned_path: join(partialBase, 'Gamma') })
  ])
  const byName = new Map(partial.map((s) => [s.full_name, s]))
  check('批量里副本被删的那条 → missing-on-disk', byName.get('c/Gamma')?.state === 'missing-on-disk', String(byName.get('c/Gamma')?.state))
  check('其余仓库照常给出落后数', byName.get('a/Alpha')?.state === 'behind' && byName.get('a/Alpha')?.behind === 4, JSON.stringify(byName.get('a/Alpha')))
  check('批量检查一条也不抛（失败编码在结果里）', partial.length === 3, String(partial.length))

  finish()
}

// ============================================================
// 第三部分：Mock 模式
// ============================================================

async function runMock(): Promise<void> {
  const name = 'octocat/Hello-World'

  const st = await local.checkLocalSync(name, '/nowhere/Hello-World')
  const expected = mockLocalSync(name)
  check(
    'Mock 下 checkLocalSync 委派给 mock.ts（路径不存在也照样给结果）',
    st.state === expected.state && st.behind === expected.behind && st.branch === expected.branch,
    JSON.stringify(st)
  )
  check(
    'Mock 下 simpleGit 一次都没被调用',
    stub.rawCalls.length === 0 && stub.cloneCalls.length === 0,
    `raw=${stub.rawCalls.length} clone=${stub.cloneCalls.length}`
  )

  const a = mockLocalSync('demo/Same')
  const b = mockLocalSync('demo/Same')
  check(
    '假数据是确定性的（同一仓库两次结果一致，没有 Math.random）',
    a.state === b.state && a.behind === b.behind && a.ahead === b.ahead,
    JSON.stringify(a)
  )

  // 演示数据要能覆盖到各种状态，否则界面上永远只看得到一种徽章。
  //
  // ⚠️ 这里统计的是 **(state, dirty) 组合**而不是 state 本身：「落后且脏」与「落后」
  // 的 state 都是 'behind'（dirty 与 state 是正交的两件事，见 types.ts 的说明），
  // 只数 state 的话这两条会并成一个，断言会永远差一种——那是断言写错了，
  // 不是假数据没覆盖。
  const states = new Set<string>()
  const probes: string[] = []
  for (let i = 0; i < 50; i += 1) {
    const n = `demo/Repo${i}`
    probes.push(n)
    const s = mockLocalSync(n)
    states.add(s.dirty === true ? `${s.state}+dirty` : s.state)
  }
  check(
    '假数据覆盖了全部 6 种分支（最新 / 落后 / 落后且脏 / 领先 / 分叉 / 无上游）',
    states.size === 6,
    [...states].join(',')
  )

  const pick = (pred: (s: ReturnType<typeof mockLocalSync>) => boolean): string =>
    probes.find((n) => pred(mockLocalSync(n))) ?? ''

  const behindName = pick((s) => s.state === 'behind' && s.dirty === false)
  const before = mockLocalSync(behindName)
  const updated = await local.updateLocalClone(behindName, '/nowhere/Hello-World')
  check('Mock 下落后的仓库能更新 → kind=updated', updated.kind === 'updated', `${behindName} ${updated.kind}`)
  check('Mock 下 pulled 就是原来落后的数', updated.pulled === before.behind, `${updated.pulled} vs ${before.behind}`)
  check('Mock 下更新后变成已是最新', updated.status?.state === 'up-to-date', String(updated.status?.state))
  check('Mock 下更新仍然不碰 git', stub.rawCalls.length === 0, String(stub.rawCalls.length))

  const dirtyName = pick((s) => s.state === 'behind' && s.dirty === true)
  const dirtyOut = await local.updateLocalClone(dirtyName, '/nowhere/Hello-World')
  check('Mock 下有本地改动的仓库 → refused-dirty', dirtyOut.kind === 'refused-dirty', dirtyOut.kind)
  check('Mock 下 refused-dirty 的 pulled=0', dirtyOut.pulled === 0, String(dirtyOut.pulled))

  const divergedName = pick((s) => s.state === 'diverged')
  check(
    'Mock 下分叉的仓库 → refused-diverged',
    (await local.updateLocalClone(divergedName, '/nowhere/Hello-World')).kind === 'refused-diverged'
  )

  const noUpName = pick((s) => s.state === 'no-upstream')
  check(
    'Mock 下无上游的仓库 → refused-no-upstream',
    (await local.updateLocalClone(noUpName, '/nowhere/Hello-World')).kind === 'refused-no-upstream'
  )

  const batchRepos = probes.slice(0, 3).map((n, i) => makeRepo(n, { cloned_path: `/demo/${i}` }))
  const batch = await local.checkAllLocalSync(batchRepos)
  check('Mock 下批量检查给出每个已 clone 仓库的结果', batch.length === 3, String(batch.length))
  check('Mock 下批量检查也不碰 git', stub.rawCalls.length === 0, String(stub.rawCalls.length))
  check('Mock 下 clone 也没被碰过（本自检没克隆，作为对照）', stub.cloneCalls.length === 0)

  finish()
}

// ============================================================
// 入口
// ============================================================

function main(): void {
  const scenario = process.env.SCENARIO ?? 'main'
  console.log(`== 场景：${scenario} MOCK_MODE=${process.env.MOCK_MODE} ==\n`)

  if (scenario === 'main') {
    try {
      pureChecks()
    } catch (err) {
      console.error('纯函数部分自检自身出错：', err)
      process.exit(1)
    }
    void checkFlows().catch((err: unknown) => {
      console.error('主流程自检自身出错：', err)
      process.exit(1)
    })
    return
  }
  if (scenario === 'mock') {
    void runMock().catch((err: unknown) => {
      console.error('自检自身出错：', err)
      process.exit(1)
    })
    return
  }
  check(`未知场景 ${scenario}`, false)
  finish()
}

main()
