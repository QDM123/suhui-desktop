/* ============================================================
   溯洄桌面版 · 主进程
   Phase 0：窗口创建 / 自定义标题栏控制 / IPC 白名单 / DB 初始化
   ============================================================ */
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { initDb, getDb, paths } from './db'

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#f2f4f7',
    title: '溯洄 · 桌面版',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const { quarantined } = initDb()
  if (quarantined) {
    dialog.showErrorBox(
      '数据库已损坏',
      `检测到数据库文件损坏，原文件已整体转存到：\n${quarantined}\n\n已自动创建新的空数据库，原数据未删除，可手动排查恢复。`
    )
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* ============================================================
   IPC —— 白名单通道（preload 暴露一一对应）
   ============================================================ */

/* 窗口控制（自定义标题栏） */
ipcMain.on('win:minimize', () => mainWindow?.minimize())
ipcMain.on('win:toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('win:close', () => mainWindow?.close())

/* 设置读写（示例通道，Phase 6 主题等复用） */
ipcMain.handle('settings:get', (_e, key, fallback = null) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : fallback
})

ipcMain.handle('settings:set', (_e, key, value) => {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, String(value))
  return true
})

/* 状态栏统计（Phase 0 返回 0，Phase 1 起有真实数据） */
ipcMain.handle('app:stats', () => {
  const db = getDb()
  const has = (t) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(t)
  return {
    entries: has('entries')
      ? db.prepare('SELECT COUNT(*) AS c FROM entries WHERE deleted = 0').get().c
      : 0,
    categories: has('categories')
      ? db.prepare('SELECT COUNT(*) AS c FROM categories').get().c
      : 0
  }
})

/* 数据目录 */
ipcMain.handle('app:get-data-dir', () => paths.dataDir())
ipcMain.handle('app:open-data-dir', () => {
  shell.openPath(paths.dataDir())
  return true
})
