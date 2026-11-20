/* ============================================================
   溯洄桌面版 · 主进程
   Phase 0：窗口 / 标题栏控制 / IPC 白名单 / DB 初始化（WAL + quick_check）
   Phase 1：diary/tag/category/media IPC、media:// 协议、关窗 flush 守卫
   ============================================================ */
import { app, BrowserWindow, ipcMain, dialog, shell, protocol, Notification, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { initDb, getDb, getDao, paths } from './db'
import { exportPdf, exportWord, exportLongImage, notifyDone } from './exporter.mjs'
import { createBackupZip, dailySnapshot, validateBackup, doRestore } from './backup.mjs'

/* 数据目录固定为 %APPDATA%/suhui-desktop：
   打包后 productName（溯洄桌面版）会改变 app.name，进而改变默认 userData，
   这里显式钉死，保证开发/安装版/便携版共用同一数据目录 */
app.setPath('userData', path.join(app.getPath('appData'), 'suhui-desktop'))

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

  /* 回收站 30 天保留期：启动时清理（Phase 5，计划 §6-3） */
  const { purged } = getDao().cleanupExpired()
  if (purged > 0) console.log(`[回收站] 已自动清理超过 30 天的日记 ${purged} 篇`)

  /* 每日首次启动自动快照（Phase 8，计划 §2.3 最后防线） */
  dailySnapshot()

  /* 提醒写日记：本地定时检查（Phase 8；应用未运行不提醒——托盘常驻为储备） */
  startReminderScheduler()

  /* 写日记自动填充：仅放行 geolocation 权限，其余拒绝 */
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'geolocation')
  })

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
ipcMain.handle('app:get-version', () => app.getVersion())

/* ---------- 日记（Phase 1） ---------- */
ipcMain.handle('diary:ensure-draft', (_e, init) => getDao().ensureDraft(init))
ipcMain.handle('diary:patch', (_e, id, patch) => getDao().patchEntry(id, patch))
ipcMain.handle('diary:get', (_e, id) => getDao().getEntry(id))
ipcMain.handle('diary:today', () => getDao().listToday())
ipcMain.handle('diary:set-tags', (_e, id, names) => getDao().setTags(id, names))

/* ---------- 日记（Phase 2：时间轴） ---------- */
ipcMain.handle('diary:list', (_e, categoryId) => getDao().listEntries(categoryId))
ipcMain.handle('diary:soft-delete', (_e, id) => getDao().softDelete(id))

/* ---------- 搜索（Phase 3） ---------- */
ipcMain.handle('diary:search', (_e, q, categoryId) => getDao().searchEntries(q, categoryId))

/* ---------- 日历/时光隧道（Phase 4） ---------- */
ipcMain.handle('diary:range', (_e, fromDay, toDay) => getDao().entriesInRange(fromDay, toDay))
ipcMain.handle('diary:latest-weather', () => getDao().latestWeather())

/* ---------- 相册 / 回收站（Phase 5） ---------- */
ipcMain.handle('media:list-all', () => getDao().listAllMedia())
ipcMain.handle('bin:list', () => getDao().listDeleted())
ipcMain.handle('bin:restore', (_e, id) => getDao().restore(id))
ipcMain.handle('bin:purge', (_e, id) => getDao().purge(id))

/* ---------- 导出（Phase 7） ---------- */
ipcMain.handle('export:run', async (_e, type, opts) => {
  const dao = getDao()
  const entries = dao.listForExport(opts || {})
  if (!entries.length) return { ok: false, error: '没有符合条件的日记' }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const cfg = type === 'pdf'
    ? { title: '导出 PDF', name: `溯洄日记-${stamp}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }
    : { title: '导出 Word', name: `溯洄日记-${stamp}.docx`, filters: [{ name: 'Word', extensions: ['docx'] }] }
  const r = await dialog.showSaveDialog(mainWindow, {
    title: cfg.title,
    defaultPath: path.join(app.getPath('documents'), cfg.name),
    filters: cfg.filters
  })
  if (r.canceled || !r.filePath) return { canceled: true }

  const bufLen = type === 'pdf'
    ? await exportPdf(entries, paths.mediaDir(), r.filePath)
    : await exportWord(entries, paths.mediaDir(), r.filePath)
  getDao().addExportFile(type, r.filePath, bufLen)
  notifyDone(path.basename(r.filePath))
  return { ok: true, path: r.filePath, size: bufLen }
})

ipcMain.handle('export:long-image', async (_e, entryId) => {
  const data = getDao().getEntry(entryId)
  if (!data) return { ok: false, error: '日记不存在' }
  const e = { ...data.entry, tags: data.tags.map((t) => t.name), media: data.media }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const r = await dialog.showSaveDialog(mainWindow, {
    title: '生成长图',
    defaultPath: path.join(app.getPath('documents'), `日记长图-${e.title.slice(0, 12)}-${stamp}.png`),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  })
  if (r.canceled || !r.filePath) return { canceled: true }
  const bufLen = await exportLongImage(e, paths.mediaDir(), r.filePath)
  getDao().addExportFile('image', r.filePath, bufLen)
  notifyDone(path.basename(r.filePath))
  return { ok: true, path: r.filePath, size: bufLen }
})

ipcMain.handle('export:history', () => getDao().listExportFiles())
ipcMain.handle('export:delete-record', (_e, id) => getDao().deleteExportFile(id))
ipcMain.handle('export:reveal', (_e, p) => { shell.showItemInFolder(p); return true })

/* ---------- 提醒写日记（Phase 8） ---------- */

const REMINDER = { enabled: false, time: '21:00', lastDay: null }

function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : fallback
}
function setSetting(key, value) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, String(value))
}

async function loadReminderSettings() {
  REMINDER.enabled = getSetting('reminder.enabled', '0') === '1'
  REMINDER.time = getSetting('reminder.time', '21:00')
  REMINDER.lastDay = getSetting('reminder.lastDay', null)
}

function checkReminder() {
  if (!REMINDER.enabled) return
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const hhmm = `${p(now.getHours())}:${p(now.getMinutes())}`
  if (hhmm < REMINDER.time) return // 还没到提醒时间
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  if (REMINDER.lastDay === today) return
  REMINDER.lastDay = today
  setSetting('reminder.lastDay', today)
  if (getDao().countToday() > 0) return // 今天已经写过，不打扰
  const n = new Notification({
    title: '溯洄 · 桌面版',
    body: '今天还没有写日记哦，快补上...'
  })
  n.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('app:open-write')
  })
  n.show()
}

function startReminderScheduler() {
  loadReminderSettings().then(() => checkReminder()).catch(() => {})
  setInterval(() => {
    try { checkReminder() } catch { /* dao 未就绪等极端情况 */ }
  }, 30000)
}

ipcMain.handle('reminder:get', () => ({
  enabled: REMINDER.enabled,
  time: REMINDER.time
}))

ipcMain.handle('reminder:set', async (_e, { enabled, time }) => {
  if (enabled && !/^\d{2}:\d{2}$/.test(time || '')) {
    return { ok: false, error: '时间格式不正确' }
  }
  REMINDER.enabled = !!enabled
  REMINDER.time = time || '21:00'
  setSetting('reminder.enabled', REMINDER.enabled ? '1' : '0')
  setSetting('reminder.time', REMINDER.time)
  if (REMINDER.enabled) checkReminder()
  return { ok: true }
})

/* ---------- 备份 / 恢复（Phase 8） ---------- */

ipcMain.handle('backup:create', async () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const name = `suhui-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.zip`
  const r = await dialog.showSaveDialog(mainWindow, {
    title: '备份到哪里',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: 'ZIP 备份', extensions: ['zip'] }]
  })
  if (r.canceled || !r.filePath) return { canceled: true }
  const size = await createBackupZip(r.filePath)
  return { ok: true, path: r.filePath, size }
})

ipcMain.handle('backup:pick', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '选择备份文件',
    properties: ['openFile'],
    filters: [{ name: 'ZIP 备份', extensions: ['zip'] }]
  })
  if (r.canceled || !r.filePaths.length) return { canceled: true }
  const v = validateBackup(r.filePaths[0])
  return { path: r.filePaths[0], ...v }
})

ipcMain.handle('backup:restore', (_e, zipPath) => {
  doRestore(zipPath)
  app.relaunch()
  app.exit(0)
  return true
})

/* ---------- 分类/标签管理（Phase 3） ---------- */
ipcMain.handle('category:create', (_e, name, color) => getDao().createCategory(name, color))
ipcMain.handle('category:update', (_e, id, patch) => getDao().updateCategory(id, patch))
ipcMain.handle('category:delete', (_e, id) => getDao().deleteCategory(id))
ipcMain.handle('tag:rename', (_e, id, name) => getDao().renameTag(id, name))
ipcMain.handle('tag:merge', (_e, fromId, toId) => getDao().mergeTags(fromId, toId))
ipcMain.handle('tag:delete', (_e, id) => getDao().deleteTag(id))

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
