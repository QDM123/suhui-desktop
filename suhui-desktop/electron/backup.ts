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
import type { BackupItem, BackupValidateResult } from '../src/types/domain'

type Db = InstanceType<typeof Database>

const SNAP_PREFIX = 'suhui-snapshot-'
const KEEP_SNAPSHOTS = 7

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/* 备份串行锁：所有备份入口（每日快照 / 定时 / 退出 / 手动 / IPC）共用一个队列，
   任何时刻只有一个备份在执行 —— 避免并发抢 backup-tmp.db 触发 Windows EPERM。
   队列吞掉前一个任务的错误，保证后续排队者照常执行 */
let backupQueue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = backupQueue.then(task)
  backupQueue = run.then(() => {}, () => {})
  return run
}

/** 生成 zip 到 destPath：db 一致性快照 + media 原文件（串行执行） */
export async function createBackupZip(destPath: string): Promise<number> {
  return serialized(() => doCreateBackupZip(destPath))
}

async function doCreateBackupZip(destPath: string): Promise<number> {
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
export async function dailySnapshot(): Promise<void> {
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
    console.warn('[备份] 每日快照失败：', (e as { message?: string })?.message || e)
  }
}

/* ---------- 自动备份（定时 / 退出时，Phase 9 追加） ---------- */

const AUTO_PREFIX = 'suhui-auto-'

/**
 * 自动备份：生成 suhui-auto-<时间戳>.zip 到 targetDir，按 keep 份数滚动清理
 * 与每日快照（suhui-snapshot-*）互不影响
 */
export async function autoBackup(targetDir: string, keep = 7): Promise<{ file: string; size: number }> {
  fs.mkdirSync(targetDir, { recursive: true })
  const dest = path.join(targetDir, `${AUTO_PREFIX}${stamp()}.zip`)
  const size = await createBackupZip(dest)
  const all = fs.readdirSync(targetDir).filter((f) => f.startsWith(AUTO_PREFIX)).sort().reverse()
  for (const f of all.slice(Math.max(1, keep))) {
    try { fs.rmSync(path.join(targetDir, f), { force: true }) } catch { /* ignore */ }
  }
  return { file: path.basename(dest), size }
}

/* ---------- 备份管理中心（列表 / 立即备份 / 删除，Phase 9 追加） ---------- */

const MANUAL_PREFIX = 'suhui-backup-'

/** 列出目录内全部备份（快照 / 自动 / 手动三类前缀），按时间倒序 */
export function listBackups(dir: string): BackupItem[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.zip') &&
      (f.startsWith(SNAP_PREFIX) || f.startsWith(AUTO_PREFIX) || f.startsWith(MANUAL_PREFIX)))
    .map((f): BackupItem => {
      const full = path.join(dir, f)
      const st = fs.statSync(full)
      const type = f.startsWith(SNAP_PREFIX) ? 'snapshot'
        : f.startsWith(AUTO_PREFIX) ? 'auto' : 'manual'
      return { file: f, path: full, type, mtime: st.mtimeMs, size: st.size }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

/** 立即在备份目录创建一份手动备份（管理中心「立即备份」） */
export async function backupNow(dir: string): Promise<{ file: string; size: number }> {
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${MANUAL_PREFIX}${stamp()}.zip`)
  const size = await createBackupZip(dest)
  return { file: path.basename(dest), size }
}

/**
 * 删除一份备份 —— 锁最新保底：列表中最新的那份不可删，
 * 保证任何时刻至少有一份可恢复的备份在档（下一次备份成功后旧份自然解锁）
 */
export function deleteBackup(dir: string, file: string): { ok: true } | { ok: false; error: string } {
  const list = listBackups(dir)
  const target = list.find((b) => b.file === file)
  if (!target) return { ok: false, error: '备份不存在，列表可能已变化' }
  if (list[0].file === file) {
    return { ok: false, error: '最新一份备份受保护：完成下一次备份后，它将自动解锁' }
  }
  fs.rmSync(target.path, { force: true })
  return { ok: true }
}

export function validateBackup(zipPath: string): BackupValidateResult {
  let zip: AdmZip
  try { zip = new AdmZip(zipPath) } catch { return { ok: false, error: '无法读取该 zip 文件' } }
  const dbEntry = zip.getEntry('suhui.db')
  if (!dbEntry) return { ok: false, error: '备份缺少 suhui.db（不是有效的溯洄备份）' }

  const tmp = path.join(app.getPath('userData'), 'restore-check.db')
  try { fs.rmSync(tmp, { force: true }) } catch { /* ignore */ }
  fs.writeFileSync(tmp, dbEntry.getData())
  let db: Db | undefined
  try {
    db = new Database(tmp, { readonly: true })
    if (db.pragma('quick_check', { simple: true }) !== 'ok') {
      return { ok: false, error: '备份数据库校验未通过（quick_check）' }
    }
    const entries = db.prepare<[], { c: number }>('SELECT COUNT(*) c FROM entries').get()!.c
    const media = db.prepare<[], { c: number }>('SELECT COUNT(*) c FROM media').get()!.c
    return { ok: true, entries, media }
  } catch (e) {
    return { ok: false, error: '备份数据库无法打开：' + ((e as { message?: string })?.message || String(e)) }
  } finally {
    try { db?.close() } catch { /* ignore */ }
    try { fs.rmSync(tmp, { force: true }) } catch { /* ignore */ }
  }
}

/** 执行恢复：停写 → 替换 db 与 media → 重启应用 */
export function doRestore(zipPath: string): boolean {
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
