/* ============================================================
   Markdown 导入（外部日记迁移）
   - 格式：按「## YYYY-MM-DD [星期X]」标题分节，正文纯文本；
     `![alt](相对路径)` 图片行复制入 media 库（原图直存，不压缩）
   - 两段式：importPick 只解析摘要（不写入），importRun 才落库
   - 重复导入保护：同日 + 同首行（前 50 字）的条目自动跳过
   - 依赖注入（dao/db 由调用方传入）：可在纯 Node 环境直测
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

/** 节标题：1-3 级 # 开头 + 日期（后可跟星期等任意文本） */
const SECTION_RE = /^#{1,3}\s+(\d{4}-\d{2}-\d{2})\b.*$/
/** 独占一行的图片引用：![alt](path)，去掉 ?查询 与 #锚点 */
const IMG_LINE_RE = /^!\[[^\]]*\]\(([^)]+)\)$/

/** 解析 markdown 文本 → 条目数组（不接触数据库与磁盘图片） */
export function parseMarkdown(text) {
  const entries = []
  let cur = null
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd()
    const sec = line.match(SECTION_RE)
    if (sec) {
      if (cur) entries.push(cur)
      cur = { day: sec[1], textLines: [], images: [] }
      continue
    }
    if (!cur) continue // 文件头部说明（# 大标题、> 引言、---）跳过
    const t = line.trim()
    if (!t) {
      cur.textLines.push('')
      continue
    }
    if (t === '---') continue
    const img = t.match(IMG_LINE_RE)
    if (img) {
      const src = img[1].split('?')[0].split('#')[0].trim()
      if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src)) cur.images.push(src) // 仅本地相对/绝对路径
      continue
    }
    cur.textLines.push(line)
  }
  if (cur) entries.push(cur)

  for (const e of entries) {
    e.text = e.textLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }
  return entries.filter((e) => e.text || e.images.length) // 空文字空图的节跳过
}

/** 指纹首行：第一个非空行，截前 50 字 */
function firstLine(text) {
  const first = (text || '').split('\n').map((s) => s.trim()).find(Boolean) || ''
  return first.slice(0, 50)
}

function resolveImg(mdDir, src) {
  let decoded = src
  try { decoded = decodeURIComponent(src) } catch { /* 保留原样 */ }
  return path.resolve(mdDir, decoded)
}

/** 第一段：解析摘要（不写入）。返回 { ok, entries, images, missing } 或 { ok:false, error } */
export function importPick(mdPath) {
  const text = fs.readFileSync(mdPath, 'utf8')
  const entries = parseMarkdown(text)
  if (!entries.length) {
    return { ok: false, error: '未解析到日记内容（需「## YYYY-MM-DD」日期标题分节格式）' }
  }
  const mdDir = path.dirname(mdPath)
  let images = 0
  let missing = 0
  for (const e of entries) {
    for (const src of e.images) {
      images++
      if (!fs.existsSync(resolveImg(mdDir, src))) missing++
    }
  }
  return { ok: true, path: mdPath, entries: entries.length, images, missing }
}

/** 第二段：执行导入（写入）。跳过重复条目与缺失图片，逐条落库 */
export function importRun(dao, db, mdPath) {
  const text = fs.readFileSync(mdPath, 'utf8')
  const entries = parseMarkdown(text)

  /* 已有日记指纹（含本次导入，防止文件内/二次导入重复） */
  const seen = new Set(
    db.prepare('SELECT day, content FROM entries WHERE deleted = 0').all()
      .map((r) => `${r.day}|${firstLine(r.content)}`)
  )

  const mdDir = path.dirname(mdPath)
  let imported = 0
  let skippedDup = 0
  let imagesAdded = 0
  let imagesMissing = 0

  for (const e of entries) {
    const key = `${e.day}|${firstLine(e.text)}`
    if (seen.has(key)) {
      skippedDup++
      continue
    }
    const { id } = dao.ensureDraft({ occurredDay: e.day, content: e.text })
    seen.add(key)
    for (const src of e.images) {
      const abs = resolveImg(mdDir, src)
      if (!fs.existsSync(abs)) {
        imagesMissing++
        continue
      }
      try {
        const r = dao.addMediaFile(id, abs, path.basename(abs))
        if (r.added) imagesAdded++
        else imagesMissing++
      } catch {
        imagesMissing++
      }
    }
    imported++
  }
  return { ok: true, imported, skippedDup, imagesAdded, imagesMissing }
}
