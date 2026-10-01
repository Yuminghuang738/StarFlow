import { contextBridge } from 'electron'

// 本轮只是临时的最小可运行版本，P0.3 会整体替换成完整的 window.api
contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong'
})
