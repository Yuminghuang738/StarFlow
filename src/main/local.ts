// 负责人：P3 ｜ 接口规格见 docs/module-signatures.md（冻结），任务说明见 prompts/
// chooseDir / clone 的真实实现（dialog.showOpenDialog、simple-git）由 P3 补，
// 本轮只给 mock 分支。openDir 例外：它必须真的能打开目录，所以不走 mock。

import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { simpleGit } from 'simple-git'
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
  try {
    // 走 simple-git，不要用 child_process.exec('git clone ...')——注入风险和错误处理都不划算
    await simpleGit().clone(repoUrlOf(fullName), target)
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
