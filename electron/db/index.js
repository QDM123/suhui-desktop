/* ============================================================
   数据库连接与数据可靠性基线（计划 §2.3）
   - WAL + synchronous=NORMAL + foreign_keys
   - 启动 quick_check，损坏时整体转存留证后重建
   ============================================================ */
import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { runMigrations } from './migrate'

let db = null

const DB_FILE = 'suhui.db'
/* 旧版（wuji-desktop）数据目录：包名变更后 Electron 的 userData 路径随之变化，
   首次启动需把旧目录中的 wuji.db(+wal/shm) 与 media/ 迁移过来 */
const LEGACY_DATA_DIR = () => path.join(app.getPath('appData'), 'wuji-desktop')
const LEGACY_DB_FILE = 'wuji.db'

export const paths = {
  dataDir: () => app.getPath('userData'),
  dbPath: () => path.join(app.getPath('userData'), DB_FILE),
  mediaDir: () => path.join(app.getPath('userData'), 'media')
}

function openDb() {
  const conn = new Database(paths.dbPath())
  conn.pragma('journal_mode = WAL')
  conn.pragma('synchronous = NORMAL')
  conn.pragma('foreign_keys = ON')
  return conn
}

/** 损坏兜底：db(+wal/shm) 与 media/ 整体转存到 corrupted-<时间戳>/，绝不覆盖隐藏 */
function quarantine() {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)
  const qdir = path.join(paths.dataDir(), `corrupted-${stamp}`)
  fs.mkdirSync(qdir, { recursive: true })
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
    const src = path.join(paths.dataDir(), f)
    if (fs.existsSync(src)) {
      try { fs.renameSync(src, path.join(qdir, f)) } catch { /* 被占用等极端情况，尽力而为 */ }
    }
  }
  if (fs.existsSync(paths.mediaDir())) {
    try { fs.renameSync(paths.mediaDir(), path.join(qdir, 'media')) } catch { /* 同上 */ }
  }
  return qdir
}

/** 旧版数据迁移：wuji-desktop userData → suhui-desktop userData（首次启动执行，移动即迁移，旧目录保留为空壳） */
function migrateLegacyData() {
  const legacyDir = LEGACY_DATA_DIR()
  const oldDb = path.join(legacyDir, LEGACY_DB_FILE)
  const newDb = paths.dbPath()
  if (!fs.existsSync(oldDb) || fs.existsSync(newDb)) return
  fs.mkdirSync(paths.dataDir(), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const src = path.join(legacyDir, LEGACY_DB_FILE + suffix)
    if (fs.existsSync(src)) {
      try { fs.renameSync(src, newDb + suffix) } catch { /* 被占用等极端情况，下次启动重试 */ }
    }
  }
  const legacyMedia = path.join(legacyDir, 'media')
  if (fs.existsSync(legacyMedia) && !fs.existsSync(paths.mediaDir())) {
    try { fs.renameSync(legacyMedia, paths.mediaDir()) } catch { /* 同上 */ }
  }
}

/**
 * 应用启动时调用。返回 { quarantined: string|null }
 * quarantined 非空 = 检测到损坏，已转存并重建空库（调用方负责提示用户）
 */
export function initDb() {
  migrateLegacyData()
  fs.mkdirSync(paths.mediaDir(), { recursive: true })
  db = openDb()

  const check = db.pragma('quick_check', { simple: true })
  let quarantined = null
  if (check !== 'ok') {
    try { db.close() } catch { /* 忽略 */ }
    quarantined = quarantine()
    db = openDb()
  }

  runMigrations(db)
  return { quarantined }
}

export function getDb() {
  if (!db) throw new Error('数据库尚未初始化（initDb 未调用）')
  return db
}

export function closeDb() {
  if (db) {
    try { db.close() } catch { /* 忽略 */ }
    db = null
  }
}
