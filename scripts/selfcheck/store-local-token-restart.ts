// 跨进程 token 断言：方案 (c) 的**唯一**新行为就是「进程一重启就拿不到 token」，
// 而这件事在同一个进程里怎么查都查不出来——必须换一个进程、复用同一个数据目录再看一次。
//
// 跑法：由驱动器 store-local.mjs 在「写 token 的那个场景」跑完之后紧接着起一个子进程，
//      复用同一个 RUN_ID（→ 同一个 userData/库文件）与同一套 SAFESTORAGE_* 环境变量。
//      EXPECT_TOKEN=''         → 断言 getToken() === null 且 hasToken() === false（无 keyring：(c) 的核心）
//      EXPECT_TOKEN='<明文>'   → 断言 getToken() === <明文> 且 hasToken() === true（有 keyring：落盘仍然有效）
//
// 本入口只读，不播种、不写盘——否则会把「复查」变成「制造现场」。
import { app } from 'electron'
import * as store from '../../src/main/store'

const expected = process.env.EXPECT_TOKEN ?? ''
const scenario = process.env.SCENARIO ?? '?'

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`)
  if (!ok) failures++
}

async function main(): Promise<void> {
  console.log(
    `== 跨进程复查：场景=${scenario} userData=${app.getPath('userData')} keyring=${process.env.SAFESTORAGE_MODE ?? 'available'} ==\n`
  )

  const token = await store.getToken()
  const has = await store.hasToken()

  if (expected === '') {
    check('A4 重启进程后 getToken() 为 null（token 只留内存）', token === null, `实际=${JSON.stringify(token)}`)
    check('A4 重启进程后 hasToken() 为 false', has === false, `实际=${has}`)
  } else {
    check('A4 重启进程后能从磁盘解回 token', token === expected, `实际=${JSON.stringify(token)}`)
    check('A4 重启进程后 hasToken() 为 true', has === true, `实际=${has}`)
  }

  console.log(`\n== ${failures === 0 ? '全部通过' : failures + ' 项失败'} ==`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
