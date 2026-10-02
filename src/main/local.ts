// 接口规格见 docs/module-signatures.md（冻结）
// chooseDir / clone 的真实实现（dialog.showOpenDialog、simple-git）见下；
// openDir 例外：它必须真的能打开目录，所以不走 mock。

import { basename, dirname, join, parse as parsePath, sep } from 'node:path'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { lstat, realpath, rm, stat } from 'node:fs/promises'
import { app, BrowserWindow, dialog, shell } from 'electron'
import pLimit from 'p-limit'
import { simpleGit } from 'simple-git'
import type { CloneProgress, LocalSyncStatus, LocalUpdateOutcome, Repo } from '@shared/types'
import { isMockMode } from './config'
import { classifyLocalSync, decideUpdate, parseAheadBehind, type SyncProbe } from './localSync'
import { mockLocalSync, mockUpdateLocal } from './mock'

/** 'owner/repo' -> 'repo'；没有 '/' 时原样返回 */
function repoNameOf(fullName: string): string {
  const parts = fullName.split('/')
  const name = parts[1] ?? fullName

  // 这三个值不能拿去 join：'' 会被 path.join 归一化掉（join(dir, '') === dir，
  // 克隆目标直接变成用户选的父目录本身），'..' 更是落到父目录的父目录。
  // GitHub 不会返回这种 full_name，但 cloned_path 是 db 里的明文数据，
  // 威胁模型必须包含"数据被改坏"，所以这里拒绝而不是"反正不会发生"。
  if (name === '' || name === '.' || name === '..' || name.includes(sep)) {
    throw new Error(`仓库名不合法，拒绝操作：${fullName}`)
  }
  return name
}

/** 'owner/repo' -> 'https://github.com/owner/repo.git' */
function repoUrlOf(fullName: string): string {
  return `https://github.com/${fullName}.git`
}

/**
 * 单次克隆的内部记录。比对外的 CloneProgress 多一个 startedAt：
 * elapsedMs 是**读取时现算**的，不是写进度时算好存下来的（见 getCloneProgress）。
 */
interface CloneProgressEntry {
  startedAt: number
  stage: string | null
  percent: number
  processed: number
  total: number
}

/**
 * 每个仓库最近一次 clone 的进度。key 用 full_name 而不是单个变量：
 * 不同卡片的 Clone 按钮各自独立，用户完全可以同时克隆两个仓库。
 *
 * 克隆结束后**刻意不删**：删了的话，渲染进程在 clone 的 invoke 返回之前的
 * 最后一次轮询会读到 null，进度条会闪回"还没开始"。留着的代价是每个克隆过的
 * 仓库占一条记录，上限就是用户点过 Clone 的仓库数。
 */
const progressByRepo = new Map<string, CloneProgressEntry>()

/**
 * 正在进行的克隆的撤销控制器。key 与进度表一样用 full_name：渲染进程的取消
 * 按钮只交得出仓库名，路径由主进程自己算。
 *
 * 生命周期与进度表**刻意不同**：这条记录在 clone 的 finally 里必须删掉（见下），
 * 否则取消过的仓库会在 map 里留下一条永远为真的记录——之后再点 Clone，用户
 * 随手点一下"取消"就会真的掐掉新克隆，或者 cancelClone 对一个早就结束的克隆
 * 撒谎说 true。进度表反过来要留着，是为了避免渲染进程最后一次轮询读到 null。
 */
const cloneAborts = new Map<string, AbortController>()

export async function chooseDir(): Promise<string | null> {
  if (isMockMode()) {
    // mock 下不弹系统对话框，直接给一个确定存在的演示目录
    const dir = join(app.getPath('downloads'), 'StarFlowDemo')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  try {
    // 必须把 parent window 传进去，否则对话框不是模态、会被主窗口盖住，用户以为没反应
    const win = BrowserWindow.getAllWindows()[0]
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })

    if (result.canceled || result.filePaths.length === 0) {
      console.log('[local] 用户取消选择')
      return null
    }

    const selected = result.filePaths[0]
    console.log('[local] 用户选择目录：', selected)
    return selected
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[local] 选择目录失败:', message)
    throw new Error(`打开目录选择框失败：${message}`)
  }
}

export async function clone(fullName: string, targetDir: string): Promise<string | null> {
  if (isMockMode()) {
    // mock 下不真的 clone，只建目录 + 写一个 README，让"打开目录"有东西可看
    const dir = join(targetDir, repoNameOf(fullName))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'README.md'), `# ${fullName} 的本地副本\n`, 'utf8')
    return dir
  }

  const target = join(targetDir, repoNameOf(fullName))

  // 这两条前置校验必须自己做：交给 simple-git 报的是 git 原生命令错误，用户看不懂
  if (!existsSync(targetDir)) {
    throw new Error(`所选目录不存在：${targetDir}`)
  }
  if (existsSync(target)) {
    throw new Error(`目标目录已存在，请换个目录或先删除：${target}`)
  }

  const startedAt = Date.now()
  console.log(`[local] 开始克隆 ${fullName} -> ${target}`)

  // 这次克隆的撤销信号。simple-git 4.0.2 的 abort 是**构造期**选项，只能传给
  // simpleGit() 工厂，不能传给 .clone()；内部实现是 child.kill('SIGINT')，不是
  // 树杀，所以信号只掐得到 git 主进程，磁盘残留要靠下面 catch 里的清理兜底。
  // 必须在 try 之前建好并入 map：cancelClone 只有查到它才中止得了。
  const controller = new AbortController()
  cloneAborts.set(fullName, controller)

  // 先占一条记录再动手：渲染进程第一次轮询就能看到"已经跑起来了"，
  // 而不是拿到 null 以为自己问早了。
  progressByRepo.set(fullName, {
    startedAt,
    stage: null,
    percent: 0,
    processed: 0,
    total: 0
  })

  // 日志节流用的游标。git 大约每秒吐一行进度，几百 MB 的仓库能打上百行，
  // 全打到终端里反而把有用的信息冲掉了，所以只在「换阶段」和「每 10%」时打。
  let loggedStage = ''
  let loggedPercent = -10

  try {
    // 走 simple-git，不要用 child_process.exec('git clone ...')——注入风险和错误处理都不划算
    await simpleGit({
      // git 只在 stderr 是 TTY 时才默认打进度；simple-git 的 progress 插件会替
      // clone / fetch / pull / push / checkout 补上 --progress，再把
      // "Receiving objects: 47% (1234/2624)" 这类行解析成结构化事件回吐给我们。
      progress: (e) => {
        progressByRepo.set(fullName, {
          startedAt,
          stage: e.stage,
          percent: e.progress,
          processed: e.processed,
          total: e.total
        })

        // 换阶段时必须把游标重置，否则上一个阶段已经到 100% 时，
        // "每 10%" 这条规则在新阶段里永远命中不了（100 + 10 谁也到不了）。
        const stageChanged = e.stage !== loggedStage
        if (stageChanged) {
          loggedStage = e.stage
          loggedPercent = -10
        }
        if (stageChanged || e.progress >= loggedPercent + 10) {
          loggedPercent = e.progress
          console.log(`[local] ${fullName} ${e.stage} ${e.progress}% (${e.processed}/${e.total})`)
        }
      },
      // abort 是构造期选项：simpleGit 会据此在 spawn.before 时挂上监听，取消时
      // 对 git 子进程发 SIGINT。传给 .clone() 的参数里是无效的，别搬错位置。
      abort: controller.signal
    }).clone(repoUrlOf(fullName), target)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[local] 克隆失败:', message)
    // 中途失败会在磁盘上留下一个含 .git 的半成品目录，而 cloned_path 只在 clone
    // **成功返回后**才写进 db（见 repoStore.clone），于是这个目录既没人管、也逃过
    // prune 对账，用户下次点 Clone 只会撞上"目标目录已存在"——永久卡死。
    // 能走到这里就说明 target 是本次才建出来的（前面 existsSync(target) 已确认它原本不存在）。
    //
    // 取消走的也是这一条 catch：清理**必须发生在 clone 自己的 catch 里**，不能只指望
    // listMissingCloneRecords 那套磁盘对账——取消永远到不了成功返回那一行，
    // cloned_path 压根没写进 store，对账根本扫不到这个残留目录。
    await cleanupPartialClone(target)
    // 用户主动取消 = 静默成功：返回 null，渲染进程安静收场，不按失败抛错。
    // （界面以为在跑、主进程其实已结束是正常竞态，cancelClone 的 false 同属此类。）
    if (controller.signal.aborted) return null
    throw new Error(
      `克隆失败：${message}（请确认本机已安装 git 并加入 PATH，且网络可访问 GitHub）`
    )
  } finally {
    // 成功、失败、取消都要清：漏掉的话 map 会为每个克隆过的仓库留下一条永不过期的
    // 记录，之后的 cancelClone 就会对一个早就结束的克隆谎报 true。
    cloneAborts.delete(fullName)
  }

  console.log(`[local] 克隆完成，耗时 ${Date.now() - startedAt}ms`)
  return target
}

/**
 * 供渲染进程轮询的克隆进度。没有记录时返回 null——含义是"这个仓库现在没有
 * 正在进行的克隆"（还没点、Mock 模式、或从没克隆过），此时界面不该画进度条。
 *
 * ⚠️ elapsedMs 在这里现算，而不是在写进度时算好存下来：git 在 counting 和
 * resolving 阶段可能十几秒不吐一行进度，存死值的话界面上的秒数会跟着冻住，
 * 用户又会以为卡死了——那正是这个进度条要解决的问题。
 */
export function getCloneProgress(fullName: string): CloneProgress | null {
  const entry = progressByRepo.get(fullName)
  if (!entry) return null
  return {
    stage: entry.stage,
    percent: entry.percent,
    processed: entry.processed,
    total: entry.total,
    elapsedMs: Date.now() - entry.startedAt
  }
}

/**
 * 中止正在进行的克隆。
 *
 * true = 确实中止了一个在跑的克隆；false = 查不到记录，本来就没有人在跑。
 * **false 不是错误**：界面以为在跑、主进程这边其实已经结束，属于正常竞态，
 * 所以刻意不抛错——渲染进程拿到 false 安静收场，不会弹一条看不懂的错误。
 *
 * 真正的撤销动作是 controller.abort()：simple-git 在 spawn.before 挂了监听，
 * 收到信号就对 git 子进程发 SIGINT。函数本身同步返回，不等克隆真的收摊；
 * 磁盘残留在 clone 的 catch 里清（见上面的说明），map 条目在 finally 里删。
 */
export function cancelClone(fullName: string): boolean {
  const controller = cloneAborts.get(fullName)
  if (controller === undefined) return false
  controller.abort()
  return true
}

export async function openDir(path: string): Promise<void> {
  try {
    // 刻意不走 mock：演示前会预先 clone 好仓库，"打开目录"必须真的打开文件管理器
    if (!existsSync(path)) {
      throw new Error(`路径不存在：${path}`)
    }

    console.log('[local] 打开目录：', path)

    // shell.openPath 返回 Promise<string>：成功是空字符串，失败是错误描述。
    // 它永远不会 reject，所以 try/catch 抓不到失败，必须检查返回值。
    const message = await shell.openPath(path)
    if (message) {
      throw new Error(`打开目录失败：${message}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[local] openDir 出错:', message)
    // 不吞错：中文原文抛回去（只补一条日志便于排查）
    throw new Error(message)
  }
}

// ============================================================
// 删除本地副本 + 磁盘对账
//
// 本文件是全项目唯一会真正删除用户文件的地方。下面这段里**闸门的顺序本身
// 就是正确性的一部分**，改写时不要重排，每一条的理由都写在原地。
// ============================================================

/** 尽力清理失败/中断的克隆残留。绝不把原始错误盖掉——只记日志 */
async function cleanupPartialClone(target: string): Promise<void> {
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    console.log('[local] 已清理未完成的克隆目录：', target)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[local] 未完成的克隆目录清理失败，请手动删除：', target, message)
  }
}

/**
 * 文件系统根、home 本身、以及 home 的祖先，一律不许删。
 *
 * 判根用 path.parse(p).root === p：它能同时覆盖 '/'、'C:\' 和 UNC 根
 * '\\server\share'，而 isAbsolute() 对这三类都返回 true，光看 '/' 是不够的。
 */
function isForbiddenRoot(p: string): boolean {
  if (parsePath(p).root === p) return true

  const home = app.getPath('home')
  if (!home) return false

  // home 自己和它的 realpath 都要比：我们拿到的是**解析过的** p，如果 home 路径里
  // 本身带符号链接（macOS 的 /tmp -> /private/tmp 就是典型），只比字符串会漏掉。
  const homes = [home]
  try {
    const real = realpathSync(home)
    if (real !== home) homes.push(real)
  } catch {
    // home 不存在就只剩字符串比较，极端情况，不额外处理
  }

  // p 是 home 的祖先时 home.startsWith(p + sep) 为真（p='/home'、home='/home/bosak'）
  return homes.some((h) => p === h || h.startsWith(p + sep))
}

/** mock 模式下 mock.clone 只往 <downloads>/StarFlowDemo 下面写，删除也只许删那里 */
async function mockCloneRoot(): Promise<string> {
  const root = join(app.getPath('downloads'), 'StarFlowDemo')
  try {
    return await realpath(root)
  } catch {
    // 演示目录还没建出来：返回原样路径，containment 检查会一律判否
    return root
  }
}

/** stat 一下，不管因为什么失败都算"不存在" */
async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/**
 * 删除某个仓库的本地副本，返回**实际被删掉的路径**（目录本就不在时返回 null）。
 *
 * 同时收 fullName 和 path：path 用来定位，fullName 用来校验"这个目录确实是这个仓库的"。
 * 路径由调用方（IPC handler）从 store 里查出来，渲染进程交不出任意路径。
 */
export async function removeClone(fullName: string, path: string): Promise<string | null> {
  // 闸门 0：存在性判定必须排在最前，其他任何检查都不能先跑。
  // 排在后面的话，目录不存在时会先撞上"不是 git 工作树"，用户永远清不掉
  // 一条指向已删目录的脏记录——那正是本次要修的问题。
  const info = await lstat(path).catch(() => null)
  if (info === null) {
    console.log('[local] 待删除的目录已不存在，按已删除处理：', path)
    return null
  }

  // 闸门 1：只删目录。lstat 不跟随符号链接，所以"顶层就是 symlink"会在这里被拦下；
  // 不能依赖 fs.rm 对 symlink 的语义（删链接还是删目标是平台相关的实现细节）。
  if (info.isSymbolicLink()) {
    throw new Error(`拒绝删除符号链接：${path}`)
  }
  if (!info.isDirectory()) {
    throw new Error(`拒绝删除非目录：${path}`)
  }

  // 闸门 2：解析真实路径。中间某一段是 symlink 时（如 /tmp/link -> /home/bosak），
  // 字符串路径看起来毫无破绽，只有 realpath 能看穿它其实指向用户主目录——
  // 而 OS 解析路径时会穿透中间 symlink，rm 删掉的是真实目标。
  let real: string
  try {
    real = await realpath(path)
  } catch {
    throw new Error(`无法解析真实路径（可能是断链的符号链接）：${path}`)
  }

  // 闸门 3：字符串路径和真实路径各过一遍。字符串路径挡根/UNC，真实路径挡"中间隔着 symlink"。
  for (const candidate of new Set([path, real])) {
    if (isForbiddenRoot(candidate)) {
      throw new Error(`拒绝删除系统根目录或用户主目录：${candidate}`)
    }
  }

  // 闸门 4：目录名必须等于仓库名。这条是根本性的——有 .git 只能证明"这是个 git 仓库"，
  // 证明不了"这是 StarFlow 克隆出来的那份"。没有它，~/Documents、~/code、用户自己的
  // 工作仓库（都可能同时满足前面所有条件）会被当成克隆副本整个删掉。
  const expected = repoNameOf(fullName)
  if (basename(real) !== expected) {
    throw new Error(`路径与仓库不匹配，拒绝删除：${basename(real)} ≠ ${expected}`)
  }

  // 闸门 5：真实模式下必须是个 git 工作树；mock 模式换成"必须位于演示目录之内"。
  // mock 的 clone 不建 .git（只写一个 README），所以这里不能改成"跳过校验"——
  // 那等于在演示模式下彻底放弃兜底，任何绝对路径都能删。
  if (isMockMode()) {
    const root = await mockCloneRoot()
    if (real === root || !real.startsWith(root + sep)) {
      throw new Error(`Mock 模式下只允许删除演示目录内的副本：${real}`)
    }
  } else if (!existsSync(join(real, '.git'))) {
    throw new Error(`不是 git 工作树，拒绝删除：${real}`)
  }

  console.log('[local] 删除本地副本：', real)
  // maxRetries/retryDelay 不能省：.git/objects 下大量文件是只读的，Windows 上裸
  // recursive 经常 EPERM/EBUSY，而 force 只吞 ENOENT、不吞 EPERM。
  await rm(real, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  return real
}

/**
 * 找出「记录里有 cloned_path、磁盘上却已经没有」的仓库，交给调用方清记录。
 *
 * 父目录启发式：目标不存在、但父目录还在 → 用户确实删掉了这个副本，清记录；
 * 目标不存在、父目录也不在 → 多半是外接盘/网络盘没挂载，**跳过**。
 * 没有这一条的话，拔一次移动硬盘就会把用户所有克隆记录永久清空。
 *
 * 用异步 stat 而不是 sync：路径挂在一个已断开的 NFS 挂载点上时，同步 stat 能把
 * 主进程连同整个 UI 一起冻住几十秒——那恰好就是这里要处理的场景。代价是它不是纯函数。
 */
export async function listMissingCloneRecords(repos: Repo[]): Promise<string[]> {
  const missing: string[] = []

  for (const repo of repos) {
    const path = repo.local?.cloned_path
    if (!path) continue

    // 存在就保留，不管它是不是目录：记录被改成指向一个普通文件属于脏数据，
    // 但清不清是"打开目录"该报错的范畴，不该由对账来替用户做决定。
    if (await pathExists(path)) continue

    if (!(await pathExists(dirname(path)))) {
      console.log('[local] 跳过对账（父目录也不存在，可能是盘未挂载）：', path)
      continue
    }

    missing.push(repo.full_name)
  }

  return missing
}

// ============================================================
// 落后上游多少 + 快进更新
//
// 判定逻辑全在 localSync.ts 的纯函数里（自检不装 git 就能跑），这里只负责
// "把事实问出来"和"在能更新时更新"，并把每个失败编码进返回值——本段所有
// 导出函数都不抛错，因为批量检查/批量更新时，一个仓库的失败不该拖垮整批。
//
// 结果**不落盘**：LocalState 一个字段都不加。重启后界面如实显示"未检查"，
// 而不是把上次的数字当成此刻的事实。
// ============================================================

/** 同时最多探测 / 更新的仓库数。与 ai.ts 的 ENRICH_CONCURRENCY 同值，别单方面调大 */
const SYNC_CONCURRENCY = 3

/**
 * 单条 git 命令的静默超时。fetch 卡在一个半死不活的网络上时，没有它整批
 * 检查会永远挂在那里——而进度条/取消在本次改动里是没有的（见下方说明）。
 */
const SYNC_TIMEOUT_MS = 30_000

/** err -> 用户看得懂的中文。宁可为空也好过把 git 的原文直接甩给用户 */
function describeGitError(err: unknown, action: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/ENOENT|not found|不是内部或外部命令|无法将/.test(raw)) {
    return '未找到 git 命令，请确认本机已安装 git 并加入 PATH'
  }
  if (/Could not resolve host|unable to access|Connection|timed out|timeout|Could not read from remote/.test(raw)) {
    return '无法连接远端仓库（请检查网络、代理或仓库权限）'
  }
  return `${action}失败：${raw}`
}

async function makeGit(realPath: string): Promise<ReturnType<typeof simpleGit>> {
  return simpleGit({ baseDir: realPath, timeout: { block: SYNC_TIMEOUT_MS } })
}

/**
 * 问一次事实：目录/git 工作树校验 + 当前分支 + 跟踪分支 + 差异 + 脏不脏。
 *
 * `fetch` 由调用方决定要不要发：探测（检查更新）需要最新数字，而"更新"是先按
 * 本地事实拒绝掉一批（dirty / 分叉 / 无上游），只对真的能更新的才发 fetch。
 * `doFetch=false` 时 ahead/behind 来自本地已有的 origin/* 引用——调用方必须
 * 知道自己拿的是"截至上次抓取"的数字，不能当最新的用。
 */
async function probeLocal(
  fullName: string,
  path: string,
  doFetch: boolean
): Promise<{ probe: SyncProbe; realPath: string | null }> {
  const probe: SyncProbe = {
    pathExists: false,
    identityMatches: false,
    isGitWorktree: false,
    branch: null,
    upstream: null,
    ahead: null,
    behind: null,
    dirty: null,
    fetchError: null,
    fatalError: null
  }

  if (!(await pathExists(path))) {
    return { probe, realPath: null }
  }
  probe.pathExists = true

  // 目录名闸门与 removeClone 同源：有 .git 只能证明"这是个 git 仓库"，
  // 证明不了"这是这个仓库的副本"。更新会写文件，比删除更该守住这一条。
  let real: string
  try {
    real = await realpath(path)
  } catch {
    probe.fatalError = `无法解析真实路径（可能是断链的符号链接）：${path}`
    return { probe, realPath: null }
  }
  probe.identityMatches = basename(real) === repoNameOf(fullName)
  if (!probe.identityMatches) {
    return { probe, realPath: real }
  }

  probe.isGitWorktree = existsSync(join(real, '.git'))
  if (!probe.isGitWorktree) {
    return { probe, realPath: real }
  }

  const git = await makeGit(real)

  try {
    probe.branch = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  } catch (err) {
    probe.fatalError = describeGitError(err, '读取分支')
    return { probe, realPath: real }
  }

  // 游离 HEAD 与无跟踪分支都不必联网：它们回答不了"落后多少"，也不该让
  // 一次检查去发一个注定用不上的网络请求。
  if (probe.branch === 'HEAD') {
    return { probe, realPath: real }
  }

  try {
    probe.upstream = (
      await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    ).trim()
  } catch {
    // @{u} 解析不出来就是没有跟踪分支，不是错误——故意吞掉 git 的原文
    probe.upstream = null
    return { probe, realPath: real }
  }

  // remote 从实际配置的跟踪分支里取（'origin/main' -> 'origin'），
  // **不拿 full_name 反推 URL**：用户可能把 origin 指向了别处或自己的 fork，
  // 按实际配置判断才是唯一诚实的答案。
  const slash = probe.upstream.indexOf('/')
  const remote = slash > 0 ? probe.upstream.slice(0, slash) : 'origin'

  if (doFetch) {
    try {
      await git.raw(['fetch', remote])
    } catch (err) {
      probe.fetchError = describeGitError(err, '抓取远端')
      return { probe, realPath: real }
    }
  }

  try {
    const diff = parseAheadBehind(
      await git.raw(['rev-list', '--left-right', '--count', `HEAD...@{u}`])
    )
    if (diff === null) {
      throw new Error('无法解析与上游的提交差异')
    }
    probe.ahead = diff.ahead
    probe.behind = diff.behind
  } catch (err) {
    probe.fatalError = describeGitError(err, '比对提交差异')
    return { probe, realPath: real }
  }

  try {
    // --porcelain 把未跟踪文件也算脏，正是我们要的：更新只允许快进，
    // 工作区不干净时先拒绝，绝不把用户的改动卷进去。
    probe.dirty = (await git.raw(['status', '--porcelain'])).trim().length > 0
  } catch (err) {
    probe.fatalError = describeGitError(err, '读取工作区状态')
  }

  return { probe, realPath: real }
}

/**
 * 探测单个仓库相对上游的状态。**不抛错**：任何失败都编码进返回值的 state/detail。
 * 结果只活在内存里，不进 store、不落盘。
 */
export async function checkLocalSync(fullName: string, path: string): Promise<LocalSyncStatus> {
  if (isMockMode()) {
    // 演示模式的 clone 没有 .git，主进程无法真探测；假数据只允许 mock.ts 伪造
    return mockLocalSync(fullName)
  }

  const { probe } = await probeLocal(fullName, path, true)
  const { state, detail } = classifyLocalSync(probe)

  return {
    full_name: fullName,
    state,
    branch: probe.branch,
    upstream: probe.upstream,
    behind: probe.behind,
    ahead: probe.ahead,
    dirty: probe.dirty,
    checkedAt: new Date().toISOString(),
    detail
  }
}

/**
 * 批量探测（并发严格 3，与 enrichRepos 同一约定）。
 *
 * 入参是完整的 repo 列表而不是只挑出已 clone 的：与 listMissingCloneRecords
 * 同一形状，调用方（IPC handler）直接交 store.getRepos() 即可。没有 cloned_path
 * 的仓库不会被检查，也不会出现在结果里。
 */
export async function checkAllLocalSync(repos: Repo[]): Promise<LocalSyncStatus[]> {
  const targets = repos.filter((r) => r.local?.cloned_path)

  if (isMockMode()) {
    return targets.map((r) => mockLocalSync(r.full_name))
  }

  const limit = pLimit(SYNC_CONCURRENCY)
  return Promise.all(
    targets.map((r) => limit(() => checkLocalSync(r.full_name, r.local?.cloned_path as string)))
  )
}

/**
 * 快进更新一个本地副本。**只做 fast-forward**：本地有改动或已分叉就拒绝并说明，
 * 绝不生成 merge 提交、绝不覆盖用户的修改。
 *
 * 与 clone/cancelClone 一样，预期内的结果走返回值而不是抛错：
 * refused-* 是"没动你的东西，原因是……"，error 才是真的失败。界面据此分别措辞。
 */
export async function updateLocalClone(
  fullName: string,
  path: string
): Promise<LocalUpdateOutcome> {
  if (isMockMode()) {
    return mockUpdateLocal(fullName)
  }

  // 先按**本地事实**探测（不发 fetch）：dirty / 分叉 / 无上游 / 游离 HEAD
  // 这几条在联网之前就能判定，没理由为一个注定拒绝的仓库打一次网络请求。
  const { probe } = await probeLocal(fullName, path, false)
  const decision = decideUpdate(probe)

  if (decision.action === 'refuse') {
    return {
      full_name: fullName,
      kind: decision.kind,
      pulled: 0,
      status: classifyToStatus(fullName, probe),
      detail: decision.detail
    }
  }
  if (decision.action === 'fail') {
    return {
      full_name: fullName,
      kind: 'error',
      pulled: 0,
      status: classifyToStatus(fullName, probe),
      detail: decision.detail
    }
  }
  if (decision.action === 'up-to-date') {
    return { full_name: fullName, kind: 'up-to-date', pulled: 0, status: await checkLocalSync(fullName, path), detail: null }
  }

  // action === 'update'：此刻本地是干净的、有的落后。先抓取再**重算**差异——
  // 用户读到的落后数可能来自上一次检查，这一次 fetch 之后才是真的。
  const upstream = probe.upstream as string
  const slash = upstream.indexOf('/')
  const remote = slash > 0 ? upstream.slice(0, slash) : 'origin'
  const git = await makeGit(await realpath(path))

  try {
    await git.raw(['fetch', remote])
  } catch (err) {
    return {
      full_name: fullName,
      kind: 'error',
      pulled: 0,
      status: null,
      detail: describeGitError(err, '抓取远端')
    }
  }

  let fresh: ReturnType<typeof parseAheadBehind> = null
  try {
    fresh = parseAheadBehind(await git.raw(['rev-list', '--left-right', '--count', 'HEAD...@{u}']))
  } catch (err) {
    return {
      full_name: fullName,
      kind: 'error',
      pulled: 0,
      status: null,
      detail: describeGitError(err, '比对提交差异')
    }
  }
  if (fresh === null) {
    return {
      full_name: fullName,
      kind: 'error',
      pulled: 0,
      status: null,
      detail: '无法解析与上游的提交差异'
    }
  }

  if (fresh.behind === 0) {
    return {
      full_name: fullName,
      kind: 'up-to-date',
      pulled: 0,
      status: await checkLocalSync(fullName, path),
      detail: null
    }
  }
  // 抓取之后才发现分叉（fetch 前本地看不到上游的新提交）：仍然拒绝，不动历史
  if (fresh.ahead > 0) {
    return {
      full_name: fullName,
      kind: 'refused-diverged',
      pulled: 0,
      status: await checkLocalSync(fullName, path),
      detail: '抓取后发现本地与上游都有各自的提交，快进无法完成'
    }
  }

  try {
    await git.raw(['merge', '--ff-only', '@{u}'])
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    // 我们在 rev-list 与 merge 之间给远端留了时间：上游又前进时 --ff-only 会失败。
    // 这属于"再点一次就好"，不该糊成一条通用错误。
    if (/fast-forward|not possible to fast-forward|diverging/i.test(raw)) {
      return {
        full_name: fullName,
        kind: 'refused-diverged',
        pulled: 0,
        status: await checkLocalSync(fullName, path),
        detail: '上游在你检查之后又有新提交，快进无法完成，请重试'
      }
    }
    return {
      full_name: fullName,
      kind: 'error',
      pulled: 0,
      status: null,
      detail: describeGitError(err, '快进')
    }
  }

  console.log(`[local] ${fullName} 已快进 ${fresh.behind} 个提交`)
  return {
    full_name: fullName,
    kind: 'updated',
    pulled: fresh.behind,
    status: await checkLocalSync(fullName, path),
    detail: null
  }
}

/** probe -> 状态，供拒绝/失败时一并返回（界面可以就地刷新徽章，不必再问一次） */
function classifyToStatus(fullName: string, probe: SyncProbe): LocalSyncStatus {
  const { state, detail } = classifyLocalSync(probe)
  return {
    full_name: fullName,
    state,
    branch: probe.branch,
    upstream: probe.upstream,
    behind: probe.behind,
    ahead: probe.ahead,
    dirty: probe.dirty,
    checkedAt: new Date().toISOString(),
    detail
  }
}

