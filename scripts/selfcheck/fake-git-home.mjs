// 自检用的临时 HOME：给 git 写一份**隔离的** global config，不动用户真实的 ~/.gitconfig。
//
// 为什么需要它：simple-git 出于安全会剥掉子进程环境里**所有** GIT_ 前缀的变量，
// 所以 GIT_CONFIG_COUNT / GIT_SSL_NO_VERIFY 那套注入方式在应用里必然无效
// （在 bash 里手跑 git clone 有效、在应用里无效——这个差异很坑）。只能让它读文件。
//
// ⚠️ 这份配置**必须分平台**。原来这里不分平台写死了 Windows 那两个键，后果是
// 在 Linux / macOS 上 git 直接报 "fatal: Unsupported SSL backend 'schannel'"
// （Schannel 是 Windows 的 TLS 实现，别的平台没有这个后端），于是所有真实 clone
// 的自检一上来就必然失败：本机（Linux）跑 store-local-e2e-realclone.mjs 是 5 项
// 全红，看着像功能坏了，其实是 fixture 把平台写死了。
//
// 两个分支要的是同一件事——**拦截式网络（TLS 中间人代理）下别因为证书链细节
// 把自检卡死**——只是各平台的旋钮不同：Windows 用 schannelCheckRevoke，
// 其余平台用 sslVerify。两者都只作用于这个临时 HOME，绝不碰用户真实配置。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HEADER = '# 自检专用：拦截式网络下放宽证书校验（只作用于这个临时 HOME，不是你的 ~/.gitconfig）'

const HTTP_SECTION =
  process.platform === 'win32'
    ? ['[http]', '\tsslBackend = schannel', '\tschannelCheckRevoke = false', '']
    : ['[http]', '\tsslVerify = false', '']

/**
 * 在 `home` 下写好 .gitconfig 并返回它，调用方把它当 HOME 传给子进程即可。
 */
export function writeFakeGitHome(home) {
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, '.gitconfig'), [HEADER, ...HTTP_SECTION].join('\n'))
  return home
}
