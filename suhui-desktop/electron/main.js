/* ============================================================
   溯洄桌面版 · 主进程
   Phase 0：窗口 / 标题栏控制 / IPC 白名单 / DB 初始化（WAL + quick_check）
   Phase 1：diary/tag/category/media IPC、media:// 协议、关窗 flush 守卫
   ============================================================ */
import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { initDb, getDb, getDao, paths } from './db'

let mainWindow = null
let closeConfirmed = false

/* 单实例锁：同一 userData 不允许两个实例同时运行
   （避免 SQLite/GPU 缓存文件互相拒绝访问） */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

/* 自定义协议 media://（渲染进程图片显示，Phase 1）
   必须在 app ready 之前注册 scheme */
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

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

  /* 关窗守卫（计划 §2.3）：先让渲染进程 flush 编辑器待写变更，
     收到 app:confirm-close 后才真正关闭 */
  mainWindow.on('close', (e) => {
    if (!closeConfirmed && mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault()
      mainWindow.webContents.send('app:before-close')
    }
  })

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

  /* media:// 协议实现：只允许访问 media/ 目录下的安全文件名 */
  const MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp'
  }
  protocol.handle('media', (req) => {
    try {
      const name = decodeURIComponent(new URL(req.url).hostname)
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(name) || name.includes('..')) {
        return new Response('bad name', { status: 400 })
      }
      const file = path.join(paths.mediaDir(), name)
      const ext = path.extname(name).toLowerCase()
      if (!MIME[ext] || !fs.existsSync(file)) {
        return new Response('not found', { status: 404 })
      }
      return new Response(fs.readFileSync(file), {
        headers: { 'content-type': MIME[ext], 'cache-control': 'no-cache' }
      })
    } catch (e) {
      return new Response('error', { status: 500 })
    }
  })

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

/* 关窗守卫握手 */
ipcMain.on('app:confirm-close', () => {
  closeConfirmed = true
  mainWindow?.close()
  closeConfirmed = false
})

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

/* 状态栏统计 */
ipcMain.handle('app:stats', () => {
  const db = getDb()
  return {
    entries: db.prepare('SELECT COUNT(*) AS c FROM entries WHERE deleted = 0').get().c,
    categories: db.prepare('SELECT COUNT(*) AS c FROM categories').get().c
  }
})

/* 数据目录 */
ipcMain.handle('app:get-data-dir', () => paths.dataDir())
ipcMain.handle('app:open-data-dir', () => {
  shell.openPath(paths.dataDir())
  return true
})
ipcMain.handle('app:recent-addresses', () => getDao().recentAddresses())

/* ---------- 日记（Phase 1） ---------- */
ipcMain.handle('diary:ensure-draft', (_e, init) => getDao().ensureDraft(init))
ipcMain.handle('diary:patch', (_e, id, patch) => getDao().patchEntry(id, patch))
ipcMain.handle('diary:get', (_e, id) => getDao().getEntry(id))
ipcMain.handle('diary:today', () => getDao().listToday())
ipcMain.handle('diary:set-tags', (_e, id, names) => getDao().setTags(id, names))

/* ---------- 分类 / 标签 ---------- */
ipcMain.handle('category:list', () => getDao().listCategories())
ipcMain.handle('tag:list-all', () => getDao().listAllTags())

/* ---------- 媒体（原图直存、不压缩） ---------- */
ipcMain.handle('media:pick-and-add', async (_e, entryId) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '选择图片（原图保存，不压缩）',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }]
  })
  if (r.canceled || !r.filePaths.length) return { added: [], skipped: [] }
  const dao = getDao()
  const added = []
  const skipped = []
  for (const p of r.filePaths) {
    const res = dao.addMediaFile(entryId, p)
    if (res.added) added.push(res.added)
    else skipped.push(res.skipped)
  }
  return { added, skipped }
})

ipcMain.handle('media:add-buffer', (_e, entryId, name, buf) =>
  getDao().addMediaBuffer(entryId, name, buf)
)

ipcMain.handle('media:remove', (_e, id) => getDao().removeMedia(id))
