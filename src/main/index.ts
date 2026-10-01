import 'dotenv/config'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

// ESM 下没有 __dirname，用 import.meta.url 推导
const __dirname = dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
