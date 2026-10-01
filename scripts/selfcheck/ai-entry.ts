// 自检入口：把 ai.ts 及其依赖链（config / mock / store / github）打成 ESM bundle，
// 并用 scripts/selfcheck/electron-stub.mjs 打桩 electron。
import * as ai from '../../src/main/ai'
import * as github from '../../src/main/github'
import * as store from '../../src/main/store'

export const summarize = ai.summarize
export const classify = ai.classify
export const enrichRepos = ai.enrichRepos
export const generateReport = ai.generateReport
export const normalizeCategory = ai.normalizeCategory

// 仅用于自检时观察依赖形态，不参与业务逻辑
export const __deps = { github, store }
