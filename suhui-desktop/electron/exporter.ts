/* ============================================================
   导出器（Phase 7）：PDF / Word / 长图 三形态
   - PDF：隐藏窗口渲染自包含 HTML → printToPDF（A4、按时间正序、保留原日期）
   - Word：docx 库生成合并 .docx
   - 长图：隐藏窗口整篇渲染 → capturePage 单张 PNG
   ============================================================ */
import { BrowserWindow, app, nativeImage, Notification } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, PageBreak } from 'docx'
import type { ParagraphChild } from 'docx'
import { WEATHERS, MOODS } from '../src/constants'
import type { EntryRow, ExportEntry, MediaRow } from '../src/types/domain'

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 导出文档条目：dao 导出取数行，或长图的单篇（tags 为名字数组、media 为媒体行） */
interface ExportDocEntry extends EntryRow {
  tags: string[]
  media: MediaRow[]
  category_name?: string | null
}

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ESC_MAP[c])
}
function mediaUrl(mediaDir: string, fileName: string): string {
  return 'file:///' + path.join(mediaDir, fileName).replace(/\\/g, '/')
}
function weatherOf(id: number) {
  return WEATHERS.find((w) => w.id === id) || WEATHERS[0]
}
function moodOf(i: number | null): string {
  return i == null ? '' : MOODS[i] || ''
}
function dateLabel(e: ExportDocEntry): string {
  const d = new Date(e.occurred_at)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_CN[e.weekday]} ${e.occurred_at.slice(11, 16)}`
}
/** 元信息串：日期 · 天气 · 心情 · 分类 · 地址（导出三格式共用） */
function metaText(e: ExportDocEntry): string {
  const parts = [dateLabel(e)]
  parts.push(`${weatherOf(e.weather).icon}${weatherOf(e.weather).name}`)
  if (moodOf(e.mood)) parts.push(moodOf(e.mood))
  if (e.category_name) parts.push(`分类：${e.category_name}`)
  if (e.address) parts.push(`📍${e.address}`)
  return parts.join(' · ')
}
function imgDims(mediaDir: string, m: MediaRow): { width: number; height: number } {
  try {
    const s = nativeImage.createFromPath(path.join(mediaDir, m.file_name)).getSize()
    if (s.width > 0) return { width: s.width, height: s.height }
  } catch { /* ignore */ }
  return { width: m.width || 0, height: m.height || 0 }
}
function extType(name: string): 'png' | 'gif' | 'bmp' | 'jpg' {
  const e = path.extname(name).toLowerCase()
  if (e === '.png') return 'png'
  if (e === '.gif') return 'gif'
  if (e === '.bmp') return 'bmp'
  return 'jpg'
}

/* ---------- HTML 模板 ---------- */

const BASE_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:"Microsoft YaHei","PingFang SC",sans-serif; color:#2b2f36; background:#fff; }
`

function entryBlockHtml(e: ExportDocEntry, mediaDir: string, _opts: object = {}): string {
  const imgs = e.media
    .map((m) => `<img src="${mediaUrl(mediaDir, m.file_name)}" alt="">`)
    .join('')
  return `
  <section class="entry">
    <div class="meta">${esc(metaText(e))}</div>
    <h2>${esc(e.title)}</h2>
    <div class="content">${esc(e.content)}</div>
    ${imgs ? `<div class="imgs">${imgs}</div>` : ''}
    ${e.tags.length ? `<div class="tags">${e.tags.map((t) => '#' + esc(t)).join('　')}</div>` : ''}
  </section>`
}

/** PDF：A4 打印排版 */
function buildPdfHtml(entries: ExportDocEntry[], mediaDir: string, title: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    .head { text-align:center; padding:26px 0 10px; font-size:20px; font-weight:700; letter-spacing:2px; }
    .head .sub { font-size:12px; color:#888; font-weight:400; margin-top:6px; letter-spacing:1px; }
    .entry { page-break-inside:avoid; padding:18px 8px 10px; border-top:1px dashed #d8dce4; }
    .entry:first-of-type { border-top:0; }
    .meta { font-size:12px; color:#8695B2; margin-bottom:6px; }
    h2 { font-size:18px; margin-bottom:10px; }
    .content { font-size:14px; line-height:2; white-space:pre-wrap; }
    .imgs { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-top:12px; }
    .imgs img { width:100%; height:210px; object-fit:cover; border-radius:4px; }
    .tags { font-size:12px; color:#00a99d; margin-top:10px; }
    @page { margin: 14mm 12mm; }
  </style></head><body>
    <div class="head">${esc(title)}<div class="sub">共 ${entries.length} 篇 · ${new Date().toLocaleDateString('zh-CN')}</div></div>
    ${entries.map((e) => entryBlockHtml(e, mediaDir)).join('')}
  </body></html>`
}

/** 长图：720px 竖版单篇 */
function buildLongImageHtml(e: ExportDocEntry, mediaDir: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    body { width:720px; background:linear-gradient(180deg,#f2f4f7,#eef1f5); padding:28px; }
    .paper { background:#fffdf8; background-image:repeating-linear-gradient(transparent,transparent 27px,rgba(0,150,140,.10) 28px);
      border-radius:12px; padding:34px 38px; box-shadow:0 4px 18px rgba(40,50,70,.08); }
    .meta { font-size:13px; color:#8695B2; margin-bottom:12px; }
    h2 { font-size:22px; margin-bottom:14px; }
    .content { font-size:15.5px; line-height:2.15; white-space:pre-wrap; }
    .imgs { margin-top:16px; display:flex; flex-direction:column; gap:10px; }
    .imgs img { width:100%; border-radius:8px; }
    .tags { font-size:13px; color:#00a99d; margin-top:16px; }
    .foot { text-align:center; font-size:11px; color:#b6bfce; margin-top:18px; letter-spacing:2px; }
  </style></head><body>
    <div class="paper">
      <div class="meta">${esc(metaText(e))}</div>
      <h2>${esc(e.title)}</h2>
      <div class="content">${esc(e.content)}</div>
      ${e.media.length ? `<div class="imgs">${e.media.map((m) => `<img src="${mediaUrl(mediaDir, m.file_name)}" alt="">`).join('')}</div>` : ''}
      ${e.tags.length ? `<div class="tags">${e.tags.map((t) => '#' + esc(t)).join('　')}</div>` : ''}
      <div class="foot">溯洄 · 桌面版</div>
    </div>
  </body></html>`
}

/* ---------- 隐藏窗口加载 ---------- */

function tmpHtmlPath(): string {
  return path.join(app.getPath('userData'), 'export-tmp.html')
}

async function renderHiddenWindow(
  html: string,
  { width = 900, height = 800 }: { width?: number; height?: number } = {}
): Promise<BrowserWindow> {
  fs.writeFileSync(tmpHtmlPath(), html, 'utf-8')
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    webPreferences: { sandbox: true, webSecurity: false } // 需要 file:// 图片加载
  })
  try {
    await win.loadFile(tmpHtmlPath())
    return win
  } catch (e) {
    win.destroy()
    throw e
  }
}

/* ---------- 导出实现 ---------- */

export async function exportPdf(entries: ExportEntry[], mediaDir: string, savePath: string): Promise<number> {
  if (!entries.length) throw new Error('没有可导出的日记')
  const title = entries.length === 1 ? entries[0].title : '溯洄日记合集'
  const win = await renderHiddenWindow(buildPdfHtml(entries, mediaDir, title), { width: 900, height: 1200 })
  try {
    // 等图片解码
    await new Promise((r) => setTimeout(r, 300))
    const buf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    })
    fs.writeFileSync(savePath, buf)
    return buf.length
  } finally {
    win.destroy()
  }
}

export async function exportWord(entries: ExportEntry[], mediaDir: string, savePath: string): Promise<number> {
  if (!entries.length) throw new Error('没有可导出的日记')
  const children: Paragraph[] = []
  entries.forEach((e, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: i === 0 ? '溯洄日记合集' : '', bold: true, size: 36 })]
    }))
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: metaText(e), color: '8695B2', size: 20 })]
    }))
    children.push(new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [new TextRun({ text: e.title, bold: true, size: 32 })]
    }))
    for (const line of String(e.content || '').split('\n')) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 24 })], spacing: { line: 340 } }))
    }
    for (const m of e.media) {
      const f = path.join(mediaDir, m.file_name)
      if (!fs.existsSync(f)) continue
      const d = imgDims(mediaDir, m)
      const w = Math.min(480, d.width || 480)
      const h = d.width ? Math.round(d.height * (w / d.width)) : 320
      try {
        const run: ParagraphChild = new ImageRun({
          type: extType(m.file_name),
          data: fs.readFileSync(f),
          transformation: { width: w, height: h }
        })
        children.push(new Paragraph({ spacing: { before: 100, after: 100 }, children: [run] }))
      } catch { /* 跳过损坏图片 */ }
    }
    if (e.tags.length) {
      children.push(new Paragraph({
        spacing: { before: 120 },
        children: [new TextRun({ text: e.tags.map((t) => '#' + t).join('　'), color: '00A99D', size: 20 })]
      }))
    }
  })
  const doc = new Document({ sections: [{ children }] })
  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(savePath, buf)
  return buf.length
}

export async function exportLongImage(entry: ExportDocEntry, mediaDir: string, savePath: string): Promise<number> {
  const win = await renderHiddenWindow(buildLongImageHtml(entry, mediaDir), { width: 720, height: 900 })
  try {
    const height: number = await win.webContents.executeJavaScript('document.documentElement.scrollHeight')
    const capped = Math.min(height, 16000)
    win.setContentSize(720, capped)
    await new Promise((r) => setTimeout(r, 400))
    const img = await win.webContents.capturePage()
    const buf = img.toPNG()
    fs.writeFileSync(savePath, buf)
    return buf.length
  } finally {
    win.destroy()
  }
}

/* ---------- HTML 导出（文件夹形态：index.html + images/，适合迁移与分享） ---------- */

function exportEntryHtml(e: ExportDocEntry): string {
  const imgs = e.media
    .map((m) => `<img src="images/${esc(m.file_name)}" alt="" loading="lazy">`)
    .join('')
  return `
  <section class="entry">
    <div class="meta">${esc(metaText(e))}</div>
    <h2>${esc(e.title)}</h2>
    <div class="content">${esc(e.content)}</div>
    ${imgs ? `<div class="imgs">${imgs}</div>` : ''}
    ${e.tags.length ? `<div class="tags">${e.tags.map((t) => '#' + esc(t)).join('　')}</div>` : ''}
  </section>`
}

function buildExportHtml(entries: ExportDocEntry[]): string {
  const range = entries.length > 1
    ? `${entries[0].day} ~ ${entries[entries.length - 1].day}`
    : entries[0].day
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>溯洄日记合集</title><style>
    ${BASE_CSS}
    body { background:#eef1f5; padding:28px 14px; }
    .wrap { max-width:860px; margin:0 auto; }
    .head { text-align:center; padding:26px 0 14px; }
    .head h1 { font-size:22px; letter-spacing:3px; }
    .head .sub { font-size:12.5px; color:#8695B2; margin-top:8px; }
    .entry { background:#fffdf8; border-radius:12px; padding:26px 30px; margin-bottom:18px;
      box-shadow:0 3px 14px rgba(40,50,70,.07); }
    .meta { font-size:12.5px; color:#8695B2; margin-bottom:8px; }
    h2 { font-size:18px; margin-bottom:12px; }
    .content { font-size:14.5px; line-height:2.05; white-space:pre-wrap; }
    .imgs { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-top:14px; }
    .imgs img { width:100%; height:240px; object-fit:cover; border-radius:8px; }
    .tags { font-size:12.5px; color:#00a99d; margin-top:12px; }
    .foot { text-align:center; font-size:11px; color:#b6bfce; margin:20px 0 8px; letter-spacing:2px; }
    @media (max-width:600px){ .imgs{grid-template-columns:1fr;} }
    @media print { body{background:#fff;padding:0;} .entry{box-shadow:none;border-bottom:1px dashed #d8dce4;border-radius:0;} }
  </style></head><body>
    <div class="wrap">
      <div class="head">
        <h1>溯洄日记合集</h1>
        <div class="sub">共 ${entries.length} 篇 · ${esc(range)} · 导出于 ${new Date().toLocaleDateString('zh-CN')}</div>
      </div>
      ${entries.map(exportEntryHtml).join('')}
      <div class="foot">溯洄 · 桌面版</div>
    </div>
  </body></html>`
}

/**
 * 导出 HTML 文件夹：targetDir/index.html + targetDir/images/<原图>
 * 返回总字节数（HTML + 图片），供导出历史记录展示。
 */
export async function exportHtml(entries: ExportEntry[], mediaDir: string, targetDir: string): Promise<number> {
  if (!entries.length) throw new Error('没有可导出的日记')
  const imgDir = path.join(targetDir, 'images')
  fs.mkdirSync(imgDir, { recursive: true })
  let copiedBytes = 0
  const copied = new Set<string>()
  for (const e of entries) {
    for (const m of e.media) {
      if (copied.has(m.file_name)) continue
      copied.add(m.file_name)
      const src = path.join(mediaDir, m.file_name)
      if (!fs.existsSync(src)) continue
      fs.copyFileSync(src, path.join(imgDir, m.file_name))
      copiedBytes += fs.statSync(src).size
    }
  }
  const html = buildExportHtml(entries)
  fs.writeFileSync(path.join(targetDir, 'index.html'), html, 'utf-8')
  return Buffer.byteLength(html, 'utf-8') + copiedBytes
}

export function notifyDone(fileName: string): void {
  try {
    new Notification({ title: '溯洄 · 桌面版', body: `导出完成：${fileName}` }).show()
  } catch { /* 通知不可用时静默 */ }
}
