// 负责人：P3 ｜ 接口规格见 docs/module-signatures.md（冻结），任务说明见 prompts/
// chooseDir / clone 的真实实现（dialog.showOpenDialog、simple-git）由 P3 补，
// 本轮只给 mock 分支。openDir 例外：它必须真的能打开目录，所以不走 mock。

import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { simpleGit } from 'simple-git'
import type { CloneProgress } from '@shared/types'
import { isMockMode } from './config'

/** 'owner/repo' -> 'repo'；没有 '/' 时原样返回 */
function repoNameOf(fullName: string): string {
  const parts = fullName.split('/')
  return parts[1] ?? fullName
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

export async function chooseDir(): Promise<string | null> {
  if (isMockMode()) {
    // mock 下不弹系统对话框，直接给一个确定存在的演示目录
    const dir = join(app.getPath('downloads'), 'StarPilotDemo')
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

export async function clone(fullName: string, targetDir: string): Promise<string> {
  if (isMockMode()) {
    // mock 下不真的 clone，只建目录 + 写一个 README，让"打开目录"有东西可看
    const repoName = fullName.split('/')[1] ?? fullName
    const dir = join(targetDir, repoName)
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
      }
    }).clone(repoUrlOf(fullName), target)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[local] 克隆失败:', message)
    throw new Error(
      `克隆失败：${message}（请确认本机已安装 git 并加入 PATH，且网络可访问 GitHub）`
    )
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

