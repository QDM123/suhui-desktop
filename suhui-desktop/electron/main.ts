/* ============================================================
   溯洄桌面版 · 主进程
   Phase 0：窗口 / 标题栏控制 / IPC 白名单 / DB 初始化（WAL + quick_check）
   Phase 1：diary/tag/category/media IPC、media:// 协议、关窗 flush 守卫
   ============================================================ */
import { app, BrowserWindow, ipcMain, dialog, shell, protocol, Notification, session } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initDb, getDb, getDao, paths } from './db'
import { exportPdf, exportWord, exportHtml, exportLongImage, notifyDone } from './exporter'
import { createBackupZip, dailySnapshot, validateBackup, doRestore, autoBackup, listBackups, backupNow, deleteBackup } from './backup'
import { importPick, importRun } from './importer'
import type { MediaRow } from '../src/types/domain'

/* 数据目录固定为 %APPDATA%/suhui-desktop：
   打包后 productName（溯洄桌面版）会改变 app.name，进而改变默认 userData，
   这里显式钉死，保证开发/安装版/便携版共用同一数据目录 */
app.setPath('userData', path.join(app.getPath('appData'), 'suhui-desktop'))

let mainWindow: BrowserWindow | null = null
let closeConfirmed = false
let closeHandshaking = false /* 握手进行中（flush→备份→关窗）：幂等标志 */

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

/* 自定义协议 media://（照片）/ paper://（自定义信纸图片）
   必须在 app ready 之前注册 scheme */
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'paper', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

function createWindow(): void {
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

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })

  /* 关窗守卫（计划 §2.3）：先让渲染进程 flush 编辑器待写变更，
     收到 app:confirm-close 后才真正关闭；
     握手进行中（退出备份期间）的重复 X 也一并拦下，避免备份被中途打断 */
  mainWindow.on('close', (e) => {
    if ((!closeConfirmed || closeHandshaking) && mainWindow && !mainWindow.isDestroyed()) {
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

  /* 自动备份：读取设置并启动定时器（Phase 9） */
  loadBackupSettings()
  scheduleAutoBackup()

  /* 提醒写日记：本地定时检查（Phase 8；应用未运行不提醒——托盘常驻为储备） */
  startReminderScheduler()

  /* 写日记自动填充：仅放行 geolocation 权限，其余拒绝 */
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'geolocation')
  })

  /* media:// 协议实现：只允许访问 media/ 目录下的安全文件名 */
  const MIME: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp'
  }
  const serveDir = (baseDir: string) => (req: Request): Response => {
    try {
      const name = decodeURIComponent(new URL(req.url).hostname)
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(name) || name.includes('..')) {
        return new Response('bad name', { status: 400 })
      }
      const file = path.join(baseDir, name)
      const ext = path.extname(name).toLowerCase()
      if (!MIME[ext] || !fs.existsSync(file)) {
        return new Response('not found', { status: 404 })
      }
      return new Response(fs.readFileSync(file), {
        headers: { 'content-type': MIME[ext], 'cache-control': 'no-cache' }
      })
    } catch {
      return new Response('error', { status: 500 })
    }
  }
  protocol.handle('media', serveDir(paths.mediaDir()))
  protocol.handle('paper', serveDir(paths.papersDir()))

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

/* 关窗守卫握手（退出时自动备份：flush 后、关窗前落一份快照）
   幂等：握手期间的重复 confirm-close 直接忽略，确保退出备份只跑一次 */
ipcMain.on('app:confirm-close', async () => {
  if (closeHandshaking) return
  closeHandshaking = true
  closeConfirmed = true
  if (BACKUP.onExit) {
    try {
      await autoBackup(BACKUP.effectiveDir(), BACKUP.keep)
      console.log('[备份] 退出时备份完成')
    } catch (e) {
      console.warn('[备份] 退出时备份失败：', (e as { message?: string })?.message || e)
    }
  }
  closeHandshaking = false /* 先解除握手占用，让下面的 close 通过守卫 */
  mainWindow?.close()
  closeConfirmed = false
})

/* 设置读写（示例通道，Phase 6 主题等复用） */
ipcMain.handle('settings:get', (_e, key, fallback = null) => {
  const row = getDb().prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : fallback
})

ipcMain.handle('settings:set', (_e, key, value) => {
  getDb()
    .prepare<[string, string], never>(
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
    entries: db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM entries WHERE deleted = 0').get()!.c,
    categories: db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM categories').get()!.c
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

/* 系统环境信息（设置-关于）：OS / 架构 / 运行形态 */
ipcMain.handle('app:get-sysinfo', () => {
  const platform = process.platform === 'win32' ? 'Windows'
    : process.platform === 'darwin' ? 'macOS' : process.platform
  return {
    os: `${platform} ${os.release()}`,
    arch: process.arch === 'x64' ? 'x64（64 位）' : process.arch,
    installType: process.env.PORTABLE_EXECUTABLE_DIR ? '便携版'
      : app.isPackaged ? '安装版（NSIS）' : '开发模式'
  }
})

/* 随系统启动（Phase 9 追加）：登录项写入注册表，仅打包版生效 */
ipcMain.handle('app:get-autostart', () => ({
  enabled: app.getLoginItemSettings().openAtLogin,
  packaged: app.isPackaged
}))
ipcMain.handle('app:set-autostart', (_e, on) => {
  if (!app.isPackaged) return { ok: false, packaged: false }
  app.setLoginItemSettings({ openAtLogin: !!on })
  return { ok: true, enabled: app.getLoginItemSettings().openAtLogin }
})

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

/* ---------- 导出（Phase 7；预览 + HTML 形态为本次增强） ---------- */

/* 导出前预览：只回轻量摘要，不传正文与图片 */
ipcMain.handle('export:preview', (_e, opts) => {
  const entries = getDao().listForExport(opts || {})
  return {
    count: entries.length,
    fromDay: entries.length ? entries[0].day : null,
    toDay: entries.length ? entries[entries.length - 1].day : null,
    mediaCount: entries.reduce((s, e) => s + e.media.length, 0),
    items: entries.map((e) => ({
      day: e.day,
      weekday: e.weekday,
      title: e.title,
      categoryName: e.category_name || '',
      mediaCount: e.media.length,
      tagCount: e.tags.length
    }))
  }
})

ipcMain.handle('export:run', async (_e, type, opts) => {
  const dao = getDao()
  const entries = dao.listForExport(opts || {})
  if (!entries.length) return { ok: false, error: '没有符合条件的日记' }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  /* HTML：文件夹形态（index.html + images/），保存对话框选的是文件夹名 */
  if (type === 'html') {
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: '导出 HTML（将生成文件夹：index.html + images）',
      defaultPath: path.join(app.getPath('documents'), `日记导出-${stamp}`),
      buttonLabel: '导出到此处',
      filters: []
    })
    if (r.canceled || !r.filePath) return { canceled: true }
    /* 目标文件夹已存在时自动加序号，避免与旧导出混在一起 */
    let dir = r.filePath
    for (let n = 2; fs.existsSync(dir); n++) dir = `${r.filePath} (${n})`
    const bufLen = await exportHtml(entries, paths.mediaDir(), dir)
    getDao().addExportFile('html', dir, bufLen)
    notifyDone(path.basename(dir))
    return { ok: true, path: dir, size: bufLen }
  }

  const cfg = type === 'pdf'
    ? { title: '导出 PDF', name: `溯洄日记-${stamp}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }
    : { title: '导出 Word', name: `溯洄日记-${stamp}.docx`, filters: [{ name: 'Word', extensions: ['docx'] }] }
  const r = await dialog.showSaveDialog(mainWindow!, {
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
  const r = await dialog.showSaveDialog(mainWindow!, {
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

/* ---------- 信纸 DIY（图片上传 + 参数生成） ---------- */
ipcMain.handle('papers:list', () => getDao().listPapers())

ipcMain.handle('papers:add-image', async (_e, name) => {
  const r = await dialog.showOpenDialog(mainWindow!, {
    title: '选择信纸图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }]
  })
  if (r.canceled || !r.filePaths.length) return { canceled: true }
  const src = r.filePaths[0]
  const ext = path.extname(src).toLowerCase()
  const fileName = crypto.randomUUID() + ext
  fs.mkdirSync(paths.papersDir(), { recursive: true })
  fs.copyFileSync(src, path.join(paths.papersDir(), fileName))
  const row = getDao().addPaper({
    name: name || path.basename(src, ext),
    kind: 'image',
    file_name: fileName
  })
  return { ok: true, paper: { ...row, config: row.config ? JSON.parse(row.config) : null } }
})

ipcMain.handle('papers:add-gen', (_e, name, config) => {
  const clean = {
    base: /^#[0-9a-fA-F]{6}$/.test(config?.base || '') ? config.base : '#fffdf8',
    pattern: ['none', 'lines', 'dots', 'grid'].includes(config?.pattern) ? config.pattern : 'none',
    patternColor: /^#[0-9a-fA-F]{6}$/.test(config?.patternColor || '')
      ? hexToRgba(config.patternColor, 0.16)
      : 'rgba(0,150,140,.16)'
  }
  const row = getDao().addPaper({ name, kind: 'gen', config: clean })
  return { ...row, config: clean }
})

ipcMain.handle('papers:remove', (_e, id) => {
  const row = getDao().getPaperFile(id)
  if (row?.file_name) {
    const f = path.join(paths.papersDir(), row.file_name)
    try { fs.existsSync(f) && fs.unlinkSync(f) } catch { /* ignore */ }
  }
  return getDao().deletePaper(id)
})

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/* ---------- 提醒写日记（Phase 8） ---------- */

interface ReminderConfig {
  enabled: boolean
  time: string
  lastDay: string | null
}
const REMINDER: ReminderConfig = { enabled: false, time: '21:00', lastDay: null }

function getSetting(key: string, fallback: string | null = null): string | null {
  const row = getDb().prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : fallback
}
function setSetting(key: string, value: string): void {
  getDb()
    .prepare<[string, string], never>(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}

async function loadReminderSettings(): Promise<void> {
  REMINDER.enabled = getSetting('reminder.enabled', '0') === '1'
  REMINDER.time = getSetting('reminder.time', '21:00') || '21:00'
  REMINDER.lastDay = getSetting('reminder.lastDay', null)
}

function checkReminder(): void {
  if (!REMINDER.enabled) return
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
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

function startReminderScheduler(): void {
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

/* ---------- 自动备份设置（定时 / 退出 / 目录 / 保留份数，Phase 9 追加） ---------- */

interface BackupConfig {
  dir: string            // 自定义备份目录；空 = 应用数据目录 backups/
  interval: number       // 运行中定时备份间隔（小时），0 = 关闭
  onExit: boolean        // 退出时自动备份
  keep: number           // 自动备份保留份数
  timer: NodeJS.Timeout | null
  effectiveDir(): string
}

const BACKUP: BackupConfig = {
  dir: '',
  interval: 6,
  onExit: true,
  keep: 7,
  timer: null,
  effectiveDir() {
    if (this.dir && fs.existsSync(this.dir)) return this.dir
    return path.join(paths.dataDir(), 'backups')
  }
}

function loadBackupSettings(): void {
  BACKUP.dir = getSetting('backup.dir', '') || ''
  BACKUP.interval = Math.max(0, Number(getSetting('backup.interval', '6')) || 0)
  BACKUP.onExit = getSetting('backup.on_exit', '1') === '1'
  BACKUP.keep = Math.min(30, Math.max(3, Number(getSetting('backup.keep', '7')) || 7))
}

function scheduleAutoBackup(): void {
  if (BACKUP.timer) { clearInterval(BACKUP.timer); BACKUP.timer = null }
  if (!BACKUP.interval) return
  BACKUP.timer = setInterval(async () => {
    try {
      const r = await autoBackup(BACKUP.effectiveDir(), BACKUP.keep)
      console.log(`[备份] 定时备份完成：${r.file}`)
    } catch (e) {
      console.warn('[备份] 定时备份失败：', (e as { message?: string })?.message || e)
    }
  }, BACKUP.interval * 3600 * 1000)
}

ipcMain.handle('backup:get-settings', () => ({
  dir: BACKUP.dir,
  interval: BACKUP.interval,
  onExit: BACKUP.onExit,
  keep: BACKUP.keep,
  effectiveDir: BACKUP.effectiveDir()
}))

ipcMain.handle('backup:set-settings', (_e, patch) => {
  if ('dir' in patch) {
    const d = String(patch.dir || '')
    if (d && !fs.existsSync(d)) return { ok: false, error: '目录不存在' }
    BACKUP.dir = d
    setSetting('backup.dir', d)
  }
  if ('interval' in patch) {
    BACKUP.interval = [0, 4, 6, 12].includes(Number(patch.interval)) ? Number(patch.interval) : 6
    setSetting('backup.interval', String(BACKUP.interval))
  }
  if ('onExit' in patch) {
    BACKUP.onExit = !!patch.onExit
    setSetting('backup.on_exit', BACKUP.onExit ? '1' : '0')
  }
  if ('keep' in patch) {
    BACKUP.keep = Math.min(30, Math.max(3, Number(patch.keep) || 7))
    setSetting('backup.keep', String(BACKUP.keep))
  }
  scheduleAutoBackup()
  return { ok: true }
})

ipcMain.handle('backup:choose-dir', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, {
    title: '选择自动备份目录',
    properties: ['openDirectory', 'createDirectory']
  })
  if (r.canceled || !r.filePaths.length) return { canceled: true }
  return { path: r.filePaths[0] }
})

/* ---------- 备份 / 恢复（Phase 8） ---------- */

ipcMain.handle('backup:create', async () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const name = `suhui-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.zip`
  const r = await dialog.showSaveDialog(mainWindow!, {
    title: '备份到哪里',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: 'ZIP 备份', extensions: ['zip'] }]
  })
  if (r.canceled || !r.filePath) return { canceled: true }
  const size = await createBackupZip(r.filePath)
  return { ok: true, path: r.filePath, size }
})

ipcMain.handle('backup:pick', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, {
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

/* ---------- 备份管理中心（Phase 9）：列表 / 立即备份 / 删除 / 校验 ---------- */

ipcMain.handle('backup:list', () => listBackups(BACKUP.effectiveDir()))

ipcMain.handle('backup:create-now', async () => {
  try {
    const r = await backupNow(BACKUP.effectiveDir())
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, error: String((e as { message?: string })?.message || e) }
  }
})

/* 删除按文件名定位（拼入备份目录），不接受任意路径 */
ipcMain.handle('backup:delete', (_e, file) => {
  try {
    return deleteBackup(BACKUP.effectiveDir(), String(file || ''))
  } catch (e) {
    return { ok: false, error: String((e as { message?: string })?.message || e) }
  }
})

ipcMain.handle('backup:validate', (_e, zipPath) => {
  try { return validateBackup(zipPath) } catch (e) { return { ok: false, error: String((e as { message?: string })?.message || e) } }
})

/* ---------- Markdown 导入（两段式：先解析摘要，确认后写入） ---------- */

ipcMain.handle('import:pick', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, {
    title: '选择 Markdown 日记文件',
    properties: ['openFile'],
    filters: [{ name: 'Markdown / 文本', extensions: ['md', 'markdown', 'txt'] }]
  })
  if (r.canceled || !r.filePaths.length) return { canceled: true }
  try {
    return importPick(r.filePaths[0])
  } catch (e) {
    return { ok: false, error: String((e as { message?: string })?.message || e) }
  }
})

ipcMain.handle('import:run', (_e, mdPath) => {
  try {
    return importRun(getDao(), getDb(), mdPath)
  } catch (e) {
    return { ok: false, error: String((e as { message?: string })?.message || e) }
  }
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
ipcMain.handle('category:reorder', (_e, ids) => getDao().reorderCategories(ids))
ipcMain.handle('tag:list-all', () => getDao().listAllTags())

/* ---------- 媒体（原图直存、不压缩） ---------- */
ipcMain.handle('media:pick-and-add', async (_e, entryId) => {
  const r = await dialog.showOpenDialog(mainWindow!, {
    title: '选择图片（原图保存，不压缩）',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }]
  })
  if (r.canceled || !r.filePaths.length) return { added: [], skipped: [] }
  const dao = getDao()
  const added: MediaRow[] = []
  const skipped: string[] = []
  for (const p of r.filePaths) {
    const res = dao.addMediaFile(entryId, p)
    if ('added' in res && res.added) added.push(res.added)
    else skipped.push((res as { skipped: string }).skipped)
  }
  return { added, skipped }
})

ipcMain.handle('media:add-buffer', (_e, entryId, name, buf) =>
  getDao().addMediaBuffer(entryId, name, buf)
)

ipcMain.handle('media:remove', (_e, id) => getDao().removeMedia(id))
