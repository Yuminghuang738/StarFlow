// 负责人：P3 ｜ 接口规格见 docs/module-signatures.md（冻结），任务说明见 prompts/
// chooseDir / clone 的真实实现（dialog.showOpenDialog、simple-git）由 P3 补，
// 本轮只给 mock 分支。openDir 例外：它必须真的能打开目录，所以不走 mock。

import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { app, shell } from 'electron'
import { isMockMode } from './config'

export async function chooseDir(): Promise<string | null> {
  if (isMockMode()) {
    // mock 下不弹系统对话框，直接给一个确定存在的演示目录
    const dir = join(app.getPath('downloads'), 'StarPilotDemo')
    mkdirSync(dir, { recursive: true })
    return dir
  }
  throw new Error('NOT_IMPLEMENTED: local.chooseDir')
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
  throw new Error('NOT_IMPLEMENTED: local.clone')
}

export async function openDir(path: string): Promise<void> {
  // 刻意不走 mock：演示前会预先 clone 好仓库，"打开目录"必须真的打开文件管理器
  if (!existsSync(path)) {
    throw new Error('路径不存在: ' + path)
  }
  const message = await shell.openPath(path)
  if (message) {
    throw new Error('打开目录失败: ' + message)
  }
}
