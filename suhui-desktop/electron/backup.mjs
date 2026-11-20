/* ============================================================
   备份 / 恢复（Phase 8）
   - 手动备份：SQLite backup API 出一致性快照 + media/ 打包 zip 到选定目录
   - 每日快照：userData/backups/ 下滚动保留最近 7 份
   - 恢复：校验 zip（含 suhui.db 且可打开）→ 停写 → 替换 → 重启
   ============================================================ */
import AdmZip from 'adm-zip'
import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getDb, closeDb, paths } from './db'

const SNAP_PREFIX = 'suhui-snapshot-'
const KEEP_SNAPSHOTS = 7

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 生成 zip 到 destPath：db 一致性快照 + media 原文件 */
export async function createBackupZip(destPath) {
  const tmpDb = path.join(app.getPath('userData'), 'backup-tmp.db')
  try { fs.rmSync(tmpDb, { force: true }) } catch { /* ignore */ }
  await getDb().backup(tmpDb) // SQLite backup API：WAL 下也能拿到一致快照

  const zip = new AdmZip()
  zip.addFile('suhui.db', fs.readFileSync(tmpDb))
  if (fs.existsSync(paths.mediaDir())) {
    zip.addLocalFolder(paths.mediaDir(), 'media')
  }
  zip.writeZip(destPath)
  fs.rmSync(tmpDb, { force: true })
  return fs.statSync(destPath).size
}

/** 每日首次启动自动快照（滚动保留 7 份），失败静默不阻塞启动 */
export async function dailySnapshot() {
  try {
    const dir = path.join(paths.dataDir(), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const todayTag = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const snaps = fs.readdirSync(dir).filter((f) => f.startsWith(SNAP_PREFIX)).sort()
    if (snaps.some((f) => f.includes(todayTag))) return // 今天已快照
    const dest = path.join(dir, `${SNAP_PREFIX}${stamp()}.zip`)
    await createBackupZip(dest)
    // 滚动清理：只留最近 7 份
    const all = fs.readdirSync(dir).filter((f) => f.startsWith(SNAP_PREFIX)).sort().reverse()
    for (const f of all.slice(KEEP_SNAPSHOTS)) {
      try { fs.rmSync(path.join(dir, f), { force: true }) } catch { /* ignore */ }
    }
    console.log(`[备份] 每日快照完成：${path.basename(dest)}`)
  } catch (e) {
    console.warn('[备份] 每日快照失败：', e?.message || e)
  }
}

/** 校验备份 zip：必须含 suhui.db 且能打开、quick_check 通过；返回统计 */
export function validateBackup(zipPath) {
  let zip
  try { zip = new AdmZip(zipPath) } catch { return { ok: false, error: '无法读取该 zip 文件' } }
  const dbEntry = zip.getEntry('suhui.db')
  if (!dbEntry) return { ok: false, error: '备份缺少 suhui.db（不是有效的溯洄备份）' }

  const tmp = path.join(app.getPath('userData'), 'restore-check.db')
  try { fs.rmSync(tmp, { force: true }) } catch { /* ignore */ }
  fs.writeFileSync(tmp, dbEntry.getData())
  let db
  try {
    db = new Database(tmp, { readonly: true })
    if (db.pragma('quick_check', { simple: true }) !== 'ok') {
      return { ok: false, error: '备份数据库校验未通过（quick_check）' }
    }
    const entries = db.prepare('SELECT COUNT(*) c FROM entries').get().c
    const media = db.prepare('SELECT COUNT(*) c FROM media').get().c
    return { ok: true, entries, media }
  } catch (e) {
    return { ok: false, error: '备份数据库无法打开：' + (e?.message || e) }
  } finally {
    try { db?.close() } catch { /* ignore */ }
    try { fs.rmSync(tmp, { force: true }) } catch { /* ignore */ }
  }
}

/** 执行恢复：停写 → 替换 db 与 media → 重启应用 */
export function doRestore(zipPath) {
  const zip = new AdmZip(zipPath)
  const dbEntry = zip.getEntry('suhui.db')
  if (!dbEntry) throw new Error('备份缺少 suhui.db')

  closeDb() // 停止写入（close 时 WAL 自动合并回主库）

  // 替换数据库
  const dbPath = path.join(paths.dataDir(), 'suhui.db')
  for (const suffix of ['-wal', '-shm']) {
    try { fs.rmSync(dbPath + suffix, { force: true }) } catch { /* ignore */ }
  }
  fs.writeFileSync(dbPath, dbEntry.getData())

  // 整体替换 media 目录
  fs.rmSync(paths.mediaDir(), { recursive: true, force: true })
  fs.mkdirSync(paths.mediaDir(), { recursive: true })
  for (const entry of zip.getEntries()) {
    if (entry.entryName.startsWith('media/') && !entry.isDirectory) {
      const name = path.basename(entry.entryName)
      if (/^[^\\/:*?"<>|]+$/.test(name)) {
        fs.writeFileSync(path.join(paths.mediaDir(), name), entry.getData())
      }
    }
  }
  return true
}
