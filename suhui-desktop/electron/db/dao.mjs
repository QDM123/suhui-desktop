/* ============================================================
   DAO —— 数据访问层（Phase 1）
   ESM（.mjs）：主进程打包用，node 冒烟测试直跑用
   所有写操作走事务（计划 §2.3）
   图片尺寸探测通过 opts.getDims 注入（主进程传 nativeImage 实现）
   ============================================================ */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const pad = (n) => String(n).padStart(2, '0')
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function localDateTime(d = new Date()) {
  return `${localDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
/** 解析 "YYYY-MM-DD" + "HH:mm" → Date（本地时间）；非法返回 null */
export function parseDayTime(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null
  const tm = /^\d{2}:\d{2}$/.test(time || '') ? time : '00:00'
  const d = new Date(`${day}T${tm}:00`)
  return isNaN(d.getTime()) ? null : d
}

export const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'])

/** 计划 §3.5：每日新增上限 150 篇 */
const DAILY_LIMIT_DEFAULT = 150

/** patch 白名单（安全：渲染进程只能改这些列） */
const PATCHABLE = new Set([
  'title', 'content', 'occurred_at', 'category_id',
  'weather', 'mood', 'address', 'background'
])

export function createDao(db, mediaDir, opts = {}) {
  const dailyLimit = opts.dailyLimit ?? DAILY_LIMIT_DEFAULT
  const getDims = opts.getDims || (() => ({ width: 0, height: 0 }))

  /* ---------- 读取 ---------- */

  const stmtGetEntry = db.prepare('SELECT * FROM entries WHERE id = ?')
  const stmtGetMedia = db.prepare(
    'SELECT * FROM media WHERE entry_id = ? ORDER BY sort, created_at'
  )
  const stmtGetTags = db.prepare(
    `SELECT t.id, t.name FROM tags t
     JOIN entry_tags et ON et.tag_id = t.id
     WHERE et.entry_id = ? ORDER BY t.name`
  )

  function titlePreview(e) {
    if (e.title) return e.title
    const first = (e.content || '').split('\n').map((s) => s.trim()).find(Boolean)
    return first ? first.slice(0, 20) : '（无标题）'
  }

  function getEntry(id) {
    const entry = stmtGetEntry.get(id)
    if (!entry) return null
    return { entry, tags: stmtGetTags.all(id), media: stmtGetMedia.all(id) }
  }

  function listToday() {
    const rows = db.prepare(
      `SELECT id, title, content, occurred_at FROM entries
       WHERE day = ? AND deleted = 0
       ORDER BY occurred_at DESC`
    ).all(localDay())
    return rows.map((r) => ({
      id: r.id,
      time: r.occurred_at.slice(11, 16),
      title: titlePreview(r)
    }))
  }

  function recentAddresses(limit = 4) {
    return db.prepare(
      `SELECT DISTINCT address FROM entries
       WHERE address <> '' AND deleted = 0
       ORDER BY updated_at DESC LIMIT ?`
    ).all(limit).map((r) => r.address)
  }

  function listCategories() {
    return db.prepare('SELECT * FROM categories ORDER BY sort, id').all()
  }

  function listAllTags() {
    return db.prepare(
      `SELECT t.id, t.name, COUNT(et.entry_id) AS used
       FROM tags t LEFT JOIN entry_tags et ON et.tag_id = t.id
       GROUP BY t.id ORDER BY used DESC, t.name`
    ).all()
  }

  /* ---------- 写入 ---------- */

  /**
   * 新建日记记录（编辑器首次任意变更时调用，计划 §2.3「新建即落点」）
   */
  const ensureDraft = db.transaction((init = {}) => {
    const today = localDay()
    const cnt = db.prepare(
      'SELECT COUNT(*) AS c FROM entries WHERE substr(created_at, 1, 10) = ?'
    ).get(today).c
    if (cnt >= dailyLimit) {
      const err = new Error('每日新增日记超过150篇限制')
      err.code = 'DAILY_LIMIT'
      throw err
    }

    const dt = parseDayTime(init.occurredDay, init.occurredTime) || new Date()
    const now = localDateTime()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO entries
         (id, title, content, occurred_at, created_at, updated_at,
          year_month, day, weekday, category_id, weather, mood, address, background, rev)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      id,
      init.title ?? '',
      init.content ?? '',
      localDateTime(dt),
      now,
      now,
      localDay(dt).slice(0, 7),
      localDay(dt),
      dt.getDay(),
      init.category_id ?? 1,
      init.weather ?? 1,
      init.mood ?? null,
      init.address ?? '',
      init.background ?? 'paper-1'
    )
    return { id }
  })

  /** 字段级更新：rev+1、updated_at 自动维护；occurred_at 变更联动分组键 */
  const patchEntry = db.transaction((id, patch) => {
    const cur = stmtGetEntry.get(id)
    if (!cur) throw new Error('日记不存在：' + id)

    const sets = []
    const vals = []
    for (const [k, v] of Object.entries(patch || {})) {
      if (!PATCHABLE.has(k)) continue
      sets.push(`${k} = ?`)
      vals.push(v === undefined ? null : v)
    }
    if (patch && patch.occurred_at != null) {
      const d = new Date(patch.occurred_at)
      if (!isNaN(d.getTime())) {
        sets.push('year_month = ?', 'day = ?', 'weekday = ?')
        vals.push(localDay(d).slice(0, 7), localDay(d), d.getDay())
      }
    }
    if (!sets.length) return { rev: cur.rev, updated_at: cur.updated_at }

    const now = localDateTime()
    sets.push('rev = rev + 1', 'updated_at = ?')
    vals.push(now, id)
    db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return { rev: cur.rev + 1, updated_at: now }
  })

  /** 设置整篇标签（名字列表，全量替换），并 touch 条目 */
  const setTags = db.transaction((id, names) => {
    const cur = stmtGetEntry.get(id)
    if (!cur) throw new Error('日记不存在：' + id)
    const clean = [...new Set((names || []).map((s) => String(s).trim()).filter(Boolean))]
    db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(id)
    const insLink = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)')
    const insTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)')
    const getTag = db.prepare('SELECT id FROM tags WHERE name = ?')
    for (const name of clean) {
      insTag.run(name)
      insLink.run(id, getTag.get(name).id)
    }
    const now = localDateTime()
    db.prepare('UPDATE entries SET rev = rev + 1, updated_at = ? WHERE id = ?').run(now, id)
    return { tags: stmtGetTags.all(id), rev: cur.rev + 1, updated_at: now }
  })

  /* ---------- 媒体（原图直存、不压缩） ---------- */

  const insertMedia = db.prepare(
    `INSERT INTO media (id, entry_id, file_name, orig_name, size, width, height, sort, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const nextSort = db.prepare(
    'SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM media WHERE entry_id = ?'
  )
  const stmtGetMediaAll = db.prepare(
    'SELECT * FROM media WHERE entry_id = ? ORDER BY sort, created_at'
  )

  function addMediaFile(entryId, srcPath, displayName) {
    const ext = path.extname(srcPath).toLowerCase()
    if (!IMG_EXT.has(ext)) return { skipped: displayName || srcPath }
    const fileName = randomUUID() + ext
    const dst = path.join(mediaDir, fileName)
    fs.mkdirSync(mediaDir, { recursive: true })
    fs.copyFileSync(srcPath, dst) // 原图字节直存
    const stat = fs.statSync(dst)
    const dims = getDims(dst)
    const id = randomUUID()
    insertMedia.run(
      id, entryId, fileName, displayName || path.basename(srcPath),
      stat.size, dims.width, dims.height,
      nextSort.get(entryId).s, localDateTime()
    )
    return { added: stmtGetMediaAll.all(entryId).find((m) => m.id === id) }
  }

  function addMediaBuffer(entryId, suggestedName, buf) {
    let ext = path.extname(suggestedName || '').toLowerCase()
    if (!IMG_EXT.has(ext)) ext = '.png'
    const fileName = randomUUID() + ext
    const dst = path.join(mediaDir, fileName)
    fs.mkdirSync(mediaDir, { recursive: true })
    fs.writeFileSync(dst, Buffer.from(buf)) // 原图字节直存
    const stat = fs.statSync(dst)
    const dims = getDims(dst)
    const id = randomUUID()
    insertMedia.run(
      id, entryId, fileName, suggestedName || fileName,
      stat.size, dims.width, dims.height,
      nextSort.get(entryId).s, localDateTime()
    )
    return stmtGetMediaAll.all(entryId).find((m) => m.id === id)
  }

  /** 删除媒体：先删文件（失败则中止），成功后事务删记录 */
  function removeMedia(id) {
    const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id)
    if (!row) return { ok: true }
    const file = path.join(mediaDir, row.file_name)
    if (fs.existsSync(file)) {
      try { fs.unlinkSync(file) } catch (e) { return { ok: false, error: String(e) } }
    }
    db.transaction(() => {
      db.prepare('DELETE FROM media WHERE id = ?').run(id)
    })()
    return { ok: true }
  }

  return {
    getEntry, listToday, recentAddresses, listCategories, listAllTags,
    ensureDraft, patchEntry, setTags,
    addMediaFile, addMediaBuffer, removeMedia,
    titlePreview, dailyLimit
  }
}
