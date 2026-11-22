/* ============================================================
   domain.ts —— 领域类型契约（A0-2）
   SQLite schema 行类型 + IPC DTO，与 electron/db/migrate.mjs、
   dao.mjs、main.js 的真实返回形状逐一对齐（2026-11-22 现状快照）。
   纯类型文件：无运行时代码。L1 数据层改造（UUID/墓碑）时同步演进。
   ============================================================ */

/* ---------- 表行类型（数据库原始行） ---------- */

/** entries 表行 */
export interface EntryRow {
  id: string
  title: string
  content: string
  occurred_at: string   // "YYYY-MM-DDTHH:mm:ss"（本地时间）
  created_at: string
  updated_at: string
  year_month: string    // "YYYY-MM"
  day: string           // "YYYY-MM-DD"
  weekday: number       // 0-6，getDay()
  category_id: number
  weather: number
  mood: number | null
  address: string
  background: string    // 信纸 id（内置 "paper-N" 或自定义 UUID）
  is_passby: number
  praise_count: number
  deleted: number       // 0/1 软删标记（墓碑）
  deleted_at: string | null
  rev: number           // 版本号，每次写操作 +1
}

/** categories 表行（L1 将转 UUID 主键） */
export interface CategoryRow {
  id: number
  name: string
  color: string         // "#RRGGBB"
  sort: number
}

/** 日记关联的标签引用（entry_tags JOIN tags 投影） */
export interface TagRef {
  id: number
  name: string
}

/** media 表行 */
export interface MediaRow {
  id: string
  entry_id: string
  file_name: string     // media/<uuid>.<ext>
  orig_name: string | null
  size: number | null
  width: number | null
  height: number | null
  sort: number
  created_at: string
}

/** export_files 表行（本地记录，不同步） */
export interface ExportFileRow {
  id: number
  type: string          // 'pdf' | 'word' | 'html' | 'image'
  path: string
  size: number | null
  created_at: string
}

/** 参数生成信纸的 config（papers.config JSON） */
export interface PaperGenConfig {
  base: string          // "#RRGGBB"
  pattern: 'none' | 'lines' | 'dots' | 'grid'
  patternColor: string  // "rgba(r,g,b,a)"
}

/** papers 表行（DB 原始行，config 为 JSON 字符串） */
export interface PaperRow {
  id: string
  name: string
  kind: 'image' | 'gen'
  file_name: string | null
  config: string | null
  created_at: string
}

/** papers API 返回行（config 已解析） */
export type Paper = Omit<PaperRow, 'config'> & { config: PaperGenConfig | null }

/* ---------- 查询 DTO ---------- */

/** 分类列表项（含未删除日记计数） */
export type CategoryWithCount = CategoryRow & { entry_count: number }

/** 时间轴 / 搜索结果项（dao.mapEntryRow） */
export type TimelineEntry = EntryRow & {
  category_name: string | null
  category_color: string | null
  media_count: number
  tags: string[]
}

/** 日记详情（diary.get） */
export interface EntryDetail {
  entry: EntryRow
  tags: TagRef[]
  media: MediaRow[]
}

/** 今日日记摘要（diary.today） */
export interface TodayItem {
  id: string
  time: string   // "HH:mm"
  title: string
}

/** 日期范围条目（diary.range，日历/时光隧道用） */
export interface RangeEntry {
  id: string
  day: string
  time: string   // "HH:mm"
  title: string
}

/** 相册媒体项（media.listAll） */
export interface AlbumMediaItem {
  id: string
  entry_id: string
  file_name: string
  orig_name: string | null
  day: string
  title: string
}

/** 回收站条目（bin.list） */
export interface BinItem {
  id: string
  title: string
  day: string
  time: string
  contentLen: number
  deleted_at: string | null
}

/** 标签管理列表项（tag.listAll，按使用数降序） */
export interface TagWithUsed {
  id: number
  name: string
  used: number
}

/** 导出取数条目（dao.listForExport） */
export type ExportEntry = EntryRow & {
  category_name: string | null
  tags: string[]
  media: MediaRow[]
}

/* ---------- 写入参数 ---------- */

/** 新建日记初始值（diary.ensureDraft） */
export interface DraftInit {
  occurredDay?: string    // "YYYY-MM-DD"
  occurredTime?: string   // "HH:mm"
  title?: string
  content?: string
  category_id?: number
  weather?: number
  mood?: number | null
  address?: string
  background?: string
}

/** 字段级更新白名单（dao.PATCHABLE） */
export type EntryPatch = Partial<Pick<
  EntryRow,
  'title' | 'content' | 'occurred_at' | 'category_id' | 'weather' | 'mood' | 'address' | 'background'
>>

/** 分类更新（category.update） */
export interface CategoryPatch {
  name?: string
  color?: string
}

/** 导出取数条件（export.preview / export.run） */
export interface ExportOptions {
  categoryIds?: number[]
  fromDay?: string | null   // "YYYY-MM-DD"
  toDay?: string | null
}

export type ExportType = 'pdf' | 'word' | 'html'

/** 参数生成信纸入参（papers.addGen；字段可选，主进程清洗） */
export interface PaperGenInput {
  base?: string
  pattern?: string
  patternColor?: string
}

/* ---------- 应用 / 设置 DTO ---------- */

/** 状态栏统计（app.stats） */
export interface DiaryStats {
  entries: number
  categories: number
}

/** 系统环境信息（app.sysinfo） */
export interface SysInfo {
  os: string
  arch: string
  installType: string   // '便携版' | '安装版（NSIS）' | '开发模式'
}

/** 随系统启动状态（app.autostart.get） */
export interface AutostartState {
  enabled: boolean
  packaged: boolean
}

/** 提醒写日记（reminder.get / reminder.set 入参） */
export interface ReminderState {
  enabled: boolean
  time: string   // "HH:mm"
}

/** 自动备份设置（backup.getSettings） */
export interface BackupSettings {
  dir: string           // 自定义目录；空 = 数据目录 backups/
  interval: number      // 小时，0=关闭
  onExit: boolean
  keep: number          // 保留份数 3-30
  effectiveDir: string
}

export type BackupSettingsPatch = Partial<Pick<BackupSettings, 'dir' | 'interval' | 'onExit' | 'keep'>>

/** 备份文件条目（backup.list，按 mtime 倒序） */
export interface BackupItem {
  file: string
  path: string
  type: 'snapshot' | 'auto' | 'manual'
  mtime: number
  size: number
}

/** 备份 zip 校验结果（backup.validate / backup.pick 内嵌） */
export type BackupValidateResult =
  | { ok: true; entries: number; media: number }
  | { ok: false; error: string }

/** 导出预览（export.preview，轻量摘要） */
export interface ExportPreview {
  count: number
  fromDay: string | null
  toDay: string | null
  mediaCount: number
  items: Array<{
    day: string
    weekday: number
    title: string
    categoryName: string
    mediaCount: number
    tagCount: number
  }>
}

/** 导出执行结果（export.run / export.longImage） */
export type ExportRunResult =
  | { canceled: true }
  | { ok: true; path: string; size: number }
  | { ok: false; error: string }

/** Markdown 导入摘要（import.pick 第二段确认前） */
export type ImportPickResult =
  | { ok: true; path: string; entries: number; images: number; missing: number }
  | { ok: false; error: string }

/** Markdown 导入执行结果（import.run） */
export type ImportRunResult =
  | { ok: true; imported: number; skippedDup: number; imagesAdded: number; imagesMissing: number }
  | { ok: false; error: string }
