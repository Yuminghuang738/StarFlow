// store.ts 的真机自检：跑在**真实 Electron** 里（真实 safeStorage / DPAPI），而不是打桩。
// 跑法：node scripts/selfcheck/store-local.mjs real
// 刻意把 userData 重定向到临时目录，避免污染真实的星标数据库。
import { join } from 'node:path'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { app, safeStorage } from 'electron'
import * as store from '../../src/main/store'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

const realUserData = app.getPath('userData')
const sandbox = mkdtempSync(join(tmpdir(), 'starpilot-real-'))
app.setPath('userData', sandbox)

interface DbShape {
  token?: string | null
  repos?: Array<{ full_name: string; local?: unknown }>
}

app.whenReady().then(async () => {
  const dbFile = join(sandbox, 'starpilot.mock.db.json')
  const readDb = (): DbShape => JSON.parse(readFileSync(dbFile, 'utf8')) as DbShape

  console.log('== 真实 Electron 环境 ==')
  console.log('真实 userData（本次没用）:', realUserData)
  console.log('本次重定向到:', sandbox)
  console.log('process.versions.electron =', process.versions.electron)
  console.log('safeStorage.isEncryptionAvailable() =', safeStorage.isEncryptionAvailable())
  console.log('')

  const repos = await store.getRepos()
  check('真实环境首次启动播种 31 条', repos.length === 31, `${repos.length} 条`)
  check('库文件落盘在 userData 下', existsSync(dbFile), dbFile)

  await store.saveToken('test-token-123')
  const token = readDb().token ?? ''
  check('落盘 token 不是裸明文', token !== 'test-token-123', token)
  check(
    '落盘 token 是 safeStorage 密文（base64）',
    /^[A-Za-z0-9+/=]+$/.test(token) && token.length > 20,
    `${token.length} 字符`
  )
  check('getToken 能解回原文', (await store.getToken()) === 'test-token-123')
  check('hasToken 为 true', (await store.hasToken()) === true)

  await store.updateLocalState('不存在的仓库', { cloned_path: 'x' }).then(
    () => check('updateLocalState 未找到仓库不抛错', true),
    (err: unknown) => check('updateLocalState 未找到仓库不抛错', false, String(err))
  )

  const target = repos[0].full_name
  await store.updateLocalState(target, { cloned_path: '/tmp/x' })
  await store.updateLocalState(target, { forked_full_name: 'me/x' })
  await store.updateLocalState(target, { cloned_path: undefined })
  const cached = (await store.getRepos()).find((r) => r.full_name === target)
  check(
    'updateLocalState 保留多字段且 undefined 不抹值',
    cached?.local?.cloned_path === '/tmp/x' && cached?.local?.forked_full_name === 'me/x',
    JSON.stringify(cached?.local)
  )

  const onDisk = readDb().repos?.find((r) => r.full_name === target)
  check(
    '缓存与磁盘内容一致',
    JSON.stringify(onDisk?.local) === JSON.stringify(cached?.local),
    JSON.stringify(onDisk?.local)
  )

  console.log(`\n== ${failures === 0 ? '真实 Electron 全部通过' : failures + ' 项失败'} ==`)
  // ⚠️ 不要用 app.exit()：在本机受限沙箱里，主进程会被残留的 GPU/子进程拖住而不退出
  //（自检已经全过、日志也打完了，就是进程不收尾）。自检不在乎 Electron 的优雅退出流程，
  // 直接用 process.exit 保证退出码可靠返回给驱动器。
  process.exit(failures === 0 ? 0 : 1)
})
