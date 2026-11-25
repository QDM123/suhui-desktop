/* ============================================================
   镜像备份（Phase 10）
   - 主数据目录（userData）与用户指定的镜像目录保持一份最新完整副本
   - 触发：每秒检测 db / media / papers 变化，停止变化 2 秒后同步（防抖）
   - 同步：db 用 SQLite backup() 出快照 → 临时文件 → 原子覆盖
           media / papers 按 size + mtime 增量复制；主目录已删的文件镜像侧同步删除
   - 不产生压缩包、不保留历史版本：镜像目录始终只有一份最新副本
   ============================================================ */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { getDb, closeDb, paths } from './db'
import type { MirrorSettings, MirrorStatus, MirrorVerifyResult } from '../src/types/domain'

type Db = InstanceType<typeof Database>

const POLL_MS = 1000
const DEBOUNCE_MS = 2000
const MANIFEST = 'manifest.json'

interface Manifest {
  lastSync: number
  dbSize: number
  mediaCount: number
  papersCount: number
  totalSize: number
}

let dir = ''
let enabled = false
let poller: NodeJS.Timeout | null = null
let debounce: NodeJS.Timeout | null = null
let lastSig = ''
let busy = false
let lastSync: number | null = null
let lastError: string | null = null

function errMsg(e: unknown): string {
  return (e as { message?: string } | null)?.message || String(e)
}

function fileSig(p: string): string {
  try {
    const st = fs.statSync(p)
    return `${st.size}:${st.mtimeMs}`
  } catch {
    return '-'
  }
}

/** 目录签名：条目数 + 目录 mtime（照片/信纸只新增或删除，不会原地改写） */
function dirSig(p: string): string {
  try {
    const st = fs.statSync(p)
    return `${fs.readdirSync(p).length}:${st.mtimeMs}`
  } catch {
    return '-'
  }
}

function currentSig(): string {
  return [
    fileSig(paths.dbPath()),
    fileSig(paths.dbPath() + '-wal'),
    dirSig(paths.mediaDir()),
    dirSig(paths.papersDir())
  ].join('|')
}

/** 递归收集相对路径 → stat（目录不存在时返回空表） */
function walk(root: string, base = '', out = new Map<string, fs.Stats>()): Map<string, fs.Stats> {
  if (!fs.existsSync(root)) return out
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    const rel = base ? `${base}/${ent.name}` : ent.name
    const full = path.join(root, ent.name)
    if (ent.isDirectory()) walk(full, rel, out)
    else if (ent.isFile()) out.set(rel, fs.statSync(full))
  }
  return out
}

function pruneEmptyDirs(root: string): void {
  if (!fs.existsSync(root)) return
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    const p = path.join(root, ent.name)
    pruneEmptyDirs(p)
    try {
      if (fs.readdirSync(p).length === 0) fs.rmdirSync(p)
    } catch { /* 被占用时下次再清 */ }
  }
}

/** 增量复制 src 中新增/变化的文件到 dst，返回复制数量 */
function copyChanged(src: string, dst: string): number {
  const srcMap = walk(src)
  const dstMap = walk(dst)
  fs.mkdirSync(dst, { recursive: true })

  let copied = 0
  for (const [rel, st] of srcMap) {
    const target = path.join(dst, rel)
    const old = dstMap.get(rel)
    if (!old || old.size !== st.size || Math.abs(old.mtimeMs - st.mtimeMs) > 1000) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(path.join(src, rel), target)
      try { fs.utimesSync(target, st.atime, st.mtime) } catch { /* 时间戳失败不影响内容 */ }
      copied++
    }
  }
  return copied
}

/** 删除 dst 中 src 已不存在的文件（在 db 快照落盘之后执行，保证镜像任意时刻可恢复） */
function pruneExtra(src: string, dst: string): void {
  const srcMap = walk(src)
  const dstMap = walk(dst)
  for (const rel of dstMap.keys()) {
    if (!srcMap.has(rel)) {
      try { fs.rmSync(path.join(dst, rel), { force: true }) } catch { /* 下次再删 */ }
    }
  }
  pruneEmptyDirs(dst)
}

function countFiles(root: string): { count: number; size: number } {
  const map = walk(root)
  let size = 0
  for (const st of map.values()) size += st.size
  return { count: map.size, size }
}

async function doSync(): Promise<void> {
  fs.mkdirSync(dir, { recursive: true })
  const mMedia = path.join(dir, 'media')
  const mPapers = path.join(dir, 'papers')

  /* 顺序：先补齐文件 → 再落 db 快照 → 最后清理多余文件
     这样镜像在任意中断点都保持"db 引用的文件一定存在"的可恢复状态 */
  copyChanged(paths.mediaDir(), mMedia)
  copyChanged(paths.papersDir(), mPapers)

  /* db：SQLite backup API 出一致性快照，写临时文件后原子覆盖 */
  const tmp = path.join(dir, '.suhui.db.tmp')
  try { fs.rmSync(tmp, { force: true }) } catch { /* ignore */ }
  await getDb().backup(tmp)
  for (const sfx of ['-wal', '-shm']) {
    try { fs.rmSync(path.join(dir, 'suhui.db') + sfx, { force: true }) } catch { /* ignore */ }
  }
  fs.renameSync(tmp, path.join(dir, 'suhui.db'))

  pruneExtra(paths.mediaDir(), mMedia)
  pruneExtra(paths.papersDir(), mPapers)

  const dbSize = fs.statSync(path.join(dir, 'suhui.db')).size
  const media = countFiles(mMedia)
  const papers = countFiles(mPapers)
  const manifest: Manifest = {
    lastSync: Date.now(),
    dbSize,
    mediaCount: media.count,
    papersCount: papers.count,
    totalSize: dbSize + media.size + papers.size
  }
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2))
  lastSync = manifest.lastSync
  lastError = null
}

function schedule(delay: number): void {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    debounce = null
    void syncMirrorNow()
  }, delay)
}

function startPoller(): void {
  stopPoller()
  poller = setInterval(() => {
    if (!enabled || !dir || busy) return
    const sig = currentSig()
    if (sig === lastSig) return
    lastSig = sig
    schedule(DEBOUNCE_MS)
  }, POLL_MS)
}

function stopPoller(): void {
  if (poller) { clearInterval(poller); poller = null }
  if (debounce) { clearTimeout(debounce); debounce = null }
}

/** 校验用户选定的镜像目录：不允许与数据目录互相嵌套 */
export function checkMirrorDir(target: string): string | null {
  if (!target) return null
  if (!fs.existsSync(target)) return '目录不存在'
  const norm = (p: string) => path.resolve(p).toLowerCase().replace(/[\\/]+$/, '')
  const t = norm(target)
  const d = norm(paths.dataDir())
  if (t === d || t.startsWith(d + path.sep)) return '备份目录不能放在数据目录内部'
  if (d.startsWith(t + path.sep)) return '备份目录不能是数据目录的上级目录'
  return null
}

export function configureMirror(nextDir: string, nextEnabled: boolean): void {
  dir = nextDir || ''
  enabled = !!nextEnabled && !!dir
  lastSig = ''
  lastError = null
  lastSync = null
  if (dir) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')) as Manifest
      lastSync = m.lastSync || null
    } catch { /* 首次还没有 manifest */ }
  }

  if (!enabled) {
    stopPoller()
    return
  }
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e) {
    lastError = errMsg(e)
  }
  startPoller()
}

export function getMirrorSettings(): MirrorSettings {
  return { dir, enabled }
}

export function mirrorStatus(): MirrorStatus {
  const status: MirrorStatus = {
    enabled: enabled && !!dir,
    dir,
    lastSync,
    dbSize: 0,
    mediaCount: 0,
    papersCount: 0,
    totalSize: 0,
    error: lastError
  }
  if (!dir) return status
  if (!fs.existsSync(dir)) {
    status.error = '备份目录不存在或不可访问'
    return status
  }
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')) as Manifest
    status.lastSync = m.lastSync || lastSync
    status.dbSize = m.dbSize
    status.mediaCount = m.mediaCount
    status.papersCount = m.papersCount
    status.totalSize = m.totalSize
  } catch { /* 未完成首次同步 */ }
  return status
}

/** 手动/立即同步：与轮询共用 busy 标志，正在同步时直接返回 */
export async function syncMirrorNow(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!enabled || !dir) return { ok: false, error: '备份未开启' }
  if (busy) return { ok: true }
  busy = true
  try {
    await doSync()
    return { ok: true }
  } catch (e) {
    lastError = errMsg(e)
    return { ok: false, error: lastError }
  } finally {
    busy = false
  }
}

/** 退出前落盘：取消防抖等待并把当前变更同步完 */
export async function flushMirror(): Promise<void> {
  if (debounce) { clearTimeout(debounce); debounce = null }
  if (!enabled || !dir) return
  while (busy) await new Promise((r) => setTimeout(r, 50))
  const r = await syncMirrorNow()
  if (!r.ok) throw new Error(r.error)
}

export function validateMirror(): MirrorVerifyResult {
  if (!dir) return { ok: false, error: '还没设置备份目录' }
  const mdb = path.join(dir, 'suhui.db')
  if (!fs.existsSync(mdb)) return { ok: false, error: '备份目录中还没有数据库（可能尚未完成首次同步）' }

  let db: Db | undefined
  try {
    db = new Database(mdb, { readonly: true, fileMustExist: true })
    if (db.pragma('quick_check', { simple: true }) !== 'ok') {
      return { ok: false, error: '备份数据库校验未通过（quick_check）' }
    }
    const entries = db.prepare<[], { c: number }>('SELECT COUNT(*) c FROM entries').get()!.c
    const media = db.prepare<[], { c: number }>('SELECT COUNT(*) c FROM media').get()!.c
    const files = countFiles(path.join(dir, 'media')).count
    return { ok: true, entries, media, files }
  } catch (e) {
    return { ok: false, error: '备份数据库无法打开：' + errMsg(e) }
  } finally {
    try { db?.close() } catch { /* ignore */ }
  }
}

/** 从镜像目录恢复：停写 → 反向整目录复制回主数据目录（调用方负责重启） */
export function restoreFromMirror(): true {
  if (!dir) throw new Error('还没设置备份目录')
  const mdb = path.join(dir, 'suhui.db')
  if (!fs.existsSync(mdb)) throw new Error('备份目录中没有数据库文件')

  stopPoller()
  closeDb() // 停止写入（close 时 WAL 自动合并回主库）

  const dbPath = paths.dbPath()
  for (const sfx of ['-wal', '-shm']) {
    try { fs.rmSync(dbPath + sfx, { force: true }) } catch { /* ignore */ }
  }
  fs.copyFileSync(mdb, dbPath)

  for (const [sub, target] of [['media', paths.mediaDir()], ['papers', paths.papersDir()]] as const) {
    const src = path.join(dir, sub)
    fs.rmSync(target, { recursive: true, force: true })
    if (fs.existsSync(src)) fs.cpSync(src, target, { recursive: true })
    fs.mkdirSync(target, { recursive: true })
  }
  return true
}
