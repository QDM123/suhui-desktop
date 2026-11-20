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
    return db.prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM entries e WHERE e.category_id = c.id AND e.deleted = 0) AS entry_count
       FROM categories c ORDER BY c.sort, c.id`
    ).all()
  }

  /* ---------- 分类管理（Phase 3） ---------- */

  const COLOR_RE = /^#[0-9a-fA-F]{6}$/
  const DEFAULT_CATEGORY_ID = 1

  function createCategory(name, color) {
    name = String(name || '').trim()
    if (!name) throw new Error('分类名不能为空')
    if (!COLOR_RE.test(color || '')) throw new Error('颜色格式不正确')
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM categories').get().s
    const r = db.prepare('INSERT INTO categories (name, color, sort) VALUES (?, ?, ?)')
      .run(name, color, maxSort + 1)
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(r.lastInsertRowid)
  }

  function updateCategory(id, { name, color }) {
    const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
    if (!cur) throw new Error('分类不存在')
    const newName = name != null ? String(name).trim() : cur.name
    if (!newName) throw new Error('分类名不能为空')
    const newColor = color != null && COLOR_RE.test(color) ? color : cur.color
    db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(newName, newColor, id)
    return { ok: true }
  }

  /** 删除分类：非空时其日记移入默认分类（id=1，不可删除） */
  const deleteCategory = db.transaction((id) => {
    if (id === DEFAULT_CATEGORY_ID) {
      const err = new Error('默认分类不可删除')
      err.code = 'DEFAULT_CAT'
      throw err
    }
    const cnt = db.prepare(
      'SELECT COUNT(*) AS c FROM entries WHERE category_id = ? AND deleted = 0'
    ).get(id).c
    if (cnt > 0) {
      db.prepare('UPDATE entries SET category_id = ? WHERE category_id = ?')
        .run(DEFAULT_CATEGORY_ID, id)
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    return { ok: true, moved: cnt }
  })

  /* ---------- 标签管理（Phase 3） ---------- */

  function renameTag(id, name) {
    name = String(name || '').trim().replace(/^#/, '')
    if (!name) throw new Error('标签名不能为空')
    try {
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
      return { ok: true }
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new Error('已存在同名标签')
      throw e
    }
  }

  /** 把 from 标签全部并入 to（from 删除，链接去重） */
  const mergeTags = db.transaction((fromId, toId) => {
    if (fromId === toId) throw new Error('不能合并到自身')
    const from = db.prepare('SELECT * FROM tags WHERE id = ?').get(fromId)
    const to = db.prepare('SELECT * FROM tags WHERE id = ?').get(toId)
    if (!from || !to) throw new Error('标签不存在')
    db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) SELECT entry_id, ? FROM entry_tags WHERE tag_id = ?')
      .run(toId, fromId)
    db.prepare('DELETE FROM entry_tags WHERE tag_id = ?').run(fromId)
    db.prepare('DELETE FROM tags WHERE id = ?').run(fromId)
    return { ok: true }
  })

  /** 删除孤儿标签（0 引用） */
  function deleteTag(id) {
    const used = db.prepare('SELECT COUNT(*) AS c FROM entry_tags WHERE tag_id = ?').get(id).c
    if (used > 0) {
      const err = new Error('该标签仍被 ' + used + ' 篇日记使用')
      err.code = 'TAG_IN_USE'
      throw err
    }
    db.prepare('DELETE FROM tags WHERE id = ?').run(id)
    return { ok: true }
  }

  /** 时间轴列表（Phase 2）：未删除，按 occurred_at 倒序，附分类名与标签 */
  const ENTRY_SELECT = `
    SELECT e.*,
           c.name AS category_name, c.color AS category_color,
           (SELECT COUNT(*) FROM media m WHERE m.entry_id = e.id) AS media_count,
           (SELECT GROUP_CONCAT(t.name, CHAR(31)) FROM entry_tags et
              JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = e.id) AS tag_names
    FROM entries e
    LEFT JOIN categories c ON c.id = e.category_id`

  function mapEntryRow(r) {
    const tags = r.tag_names ? r.tag_names.split('\u001f') : []
    delete r.tag_names
    return { ...r, tags, title: r.title || titlePreview(r) }
  }

  function listEntries(categoryId) {
    const sql = `${ENTRY_SELECT}
      WHERE e.deleted = 0 ${categoryId ? 'AND e.category_id = ?' : ''}
      ORDER BY e.occurred_at DESC, e.created_at DESC`
    const rows = categoryId ? db.prepare(sql).all(categoryId) : db.prepare(sql).all()
    return rows.map(mapEntryRow)
  }

  /**
   * 全局搜索（Phase 3）：标题+正文（≥3 字走 FTS5 trigram，短词 LIKE 兜底）+ 标签名
   * 可叠加分类过滤；返回形状与 listEntries 一致
   */
  function searchEntries(q, categoryId) {
    q = String(q || '').trim()
    if (!q) return listEntries(categoryId)

    let ftsIds = []
    if (q.length >= 3) {
      try {
        ftsIds = db.prepare('SELECT rowid FROM entries_fts WHERE entries_fts MATCH ?')
          .all(`"${q.replace(/"/g, '""')}"`)
          .map((r) => r.rowid)
      } catch { /* FTS 异常时退回 LIKE */ }
    }
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`

    const conds = ['e.deleted = 0']
    const params = []
    if (categoryId) { conds.push('e.category_id = ?'); params.push(categoryId) }
    const orParts = []
    if (ftsIds.length) {
      orParts.push(`e.rowid IN (${ftsIds.map(() => '?').join(',')})`)
      params.push(...ftsIds)
    }
    orParts.push(`e.title LIKE ? ESCAPE '\\'`)
    params.push(like)
    orParts.push(`e.content LIKE ? ESCAPE '\\'`)
    params.push(like)
    orParts.push(
      `e.id IN (SELECT et.entry_id FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name LIKE ? ESCAPE '\\')`
    )
    params.push(like)
    conds.push(`(${orParts.join(' OR ')})`)

    const sql = `${ENTRY_SELECT}
      WHERE ${conds.join(' AND ')}
      ORDER BY e.occurred_at DESC, e.created_at DESC`
    return db.prepare(sql).all(...params).map(mapEntryRow)
  }

  /** 日期范围内的日记（Phase 4：日历/时光隧道聚合用，按日升序） */
  function entriesInRange(fromDay, toDay) {
    return db.prepare(
      `SELECT id, day, occurred_at, title, content FROM entries
       WHERE deleted = 0 AND day BETWEEN ? AND ?
       ORDER BY occurred_at ASC, created_at ASC`
    ).all(fromDay, toDay).map((r) => ({
      id: r.id,
      day: r.day,
      time: r.occurred_at.slice(11, 16),
      title: r.title || titlePreview(r)
    }))
  }

  /** 最近一篇的天气（Phase 4「今天」卡片，取最近创建的一篇） */
  function latestWeather() {
    const r = db.prepare(
      'SELECT weather FROM entries WHERE deleted = 0 ORDER BY created_at DESC, rowid DESC LIMIT 1'
    ).get()
    return r ? r.weather : null
  }

  /* ---------- 相册 / 回收站（Phase 5） ---------- */

  /** 相册：全部未删除日记的媒体，按日记时间倒序 */
  function listAllMedia() {
    return db.prepare(
      `SELECT m.id, m.entry_id, m.file_name, m.orig_name, e.day, e.title, e.content
       FROM media m JOIN entries e ON e.id = m.entry_id
       WHERE e.deleted = 0
       ORDER BY e.occurred_at DESC, e.created_at DESC, m.sort ASC`
    ).all().map((r) => ({
      id: r.id,
      entry_id: r.entry_id,
      file_name: r.file_name,
      orig_name: r.orig_name,
      day: r.day,
      title: r.title || titlePreview(r)
    }))
  }

  /** 回收站列表 */
  function listDeleted() {
    return db.prepare(
      `SELECT id, title, content, day, occurred_at, deleted_at
       FROM entries WHERE deleted = 1
       ORDER BY deleted_at DESC`
    ).all().map((r) => ({
      id: r.id,
      title: r.title || titlePreview(r),
      day: r.day,
      time: r.occurred_at.slice(11, 16),
      contentLen: (r.content || '').length,
      deleted_at: r.deleted_at
    }))
  }

  /** 从回收站恢复 */
  function restore(id) {
    const r = db.prepare(
      'UPDATE entries SET deleted = 0, deleted_at = NULL WHERE id = ? AND deleted = 1'
    ).run(id)
    return { ok: r.changes > 0 }
  }

  /** 彻底删除：记录 + 媒体记录 + 媒体文件 */
  function purge(id) {
    const mediaRows = db.prepare('SELECT * FROM media WHERE entry_id = ?').all(id)
    for (const m of mediaRows) {
      const f = path.join(mediaDir, m.file_name)
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f) } catch (e) { return { ok: false, error: String(e) } }
      }
    }
    db.transaction(() => {
      db.prepare('DELETE FROM media WHERE entry_id = ?').run(id)
      db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(id)
      db.prepare('DELETE FROM entries WHERE id = ?').run(id)
    })()
    return { ok: true }
  }

  /** 30 天保留期清理（启动时调用；retention/now 可注入便于测试） */
  function cleanupExpired(retentionDays = 30, now = new Date()) {
    const cutoff = localDateTime(new Date(now.getTime() - retentionDays * 86400000))
    const expired = db.prepare(
      'SELECT id FROM entries WHERE deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?'
    ).all(cutoff)
    let purged = 0
    for (const row of expired) {
      if (purge(row.id).ok) purged++
    }
    return { purged }
  }

  /** 软删 → 回收站（Phase 2，报告 §3.2） */
  function softDelete(id) {
    const now = localDateTime()
    const r = db.prepare(
      'UPDATE entries SET deleted = 1, deleted_at = ? WHERE id = ? AND deleted = 0'
    ).run(now, id)
    return { ok: r.changes > 0 }
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
    listEntries, searchEntries, softDelete,
    entriesInRange, latestWeather,
    listAllMedia, listDeleted, restore, purge, cleanupExpired,
    createCategory, updateCategory, deleteCategory,
    renameTag, mergeTags, deleteTag,
    ensureDraft, patchEntry, setTags,
    addMediaFile, addMediaBuffer, removeMedia,
    titlePreview, dailyLimit
  }
}
