/* ============================================================
   api.d.ts —— window.api 类型契约（A0-2）
   与 electron/preload.js 暴露的 13 组方法一一对应；
   返回值按主进程 IPC handler 的真实形状标注。
   规则：三端适配器（Electron / Capacitor / ArkTS）实现本接口，
   漏方法、签名漂移在编译期报错。throws 表示 invoke 可能 reject
   （主进程 dao 抛错直传渲染层）。
   ============================================================ */
import type {
  AlbumMediaItem, AutostartState, BackupItem, BackupSettings,
  BackupSettingsPatch, BackupValidateResult, BinItem, CategoryPatch,
  CategoryRow, CategoryWithCount, DiaryStats, DraftInit, EntryDetail,
  EntryPatch, ExportFileRow, ExportOptions, ExportPreview, ExportRunResult,
  ExportType, ImportPickResult, ImportRunResult, MediaRow, Paper,
  PaperGenConfig, PaperGenInput, RangeEntry, ReminderState, SysInfo,
  TagRef, TagWithUsed, TimelineEntry, TodayItem
} from './domain'

export interface SuhuiApi {
  /* 窗口控制（自定义标题栏，桌面专属） */
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
  }

  /* 键值设置（settings 表，value 恒为字符串） */
  settings: {
    get(key: string, fallback?: string | null): Promise<string | null>
    set(key: string, value: string | number | boolean): Promise<true>
  }

  app: {
    stats(): Promise<DiaryStats>
    dataDir(): Promise<string>
    openDataDir(): Promise<true>
    recentAddresses(): Promise<string[]>
    version(): Promise<string>
    sysinfo(): Promise<SysInfo>
    autostart: {
      get(): Promise<AutostartState>
      set(on: boolean): Promise<{ ok: false; packaged: false } | { ok: true; enabled: boolean }>
    }
    /** 关窗守卫：主进程拦截 close → 通知渲染层 flush → confirmClose 放行 */
    onBeforeClose(cb: () => void): void
    confirmClose(): void
    /** 提醒通知点击 → 跳写日记 */
    onOpenWrite(cb: () => void): void
  }

  reminder: {
    get(): Promise<ReminderState>
    set(opts: ReminderState): Promise<{ ok: true } | { ok: false; error: string }>
  }

  backup: {
    create(): Promise<{ canceled: true } | { ok: true; path: string; size: number }>
    pick(): Promise<{ canceled: true } | ({ path: string } & BackupValidateResult)>
    /** 恢复后应用自动重启，正常情况下本 Promise 不会 resolve */
    restore(zipPath: string): Promise<true>
    getSettings(): Promise<BackupSettings>
    setSettings(patch: BackupSettingsPatch): Promise<{ ok: true } | { ok: false; error: string }>
    chooseDir(): Promise<{ canceled: true } | { path: string }>
    list(): Promise<BackupItem[]>
    createNow(): Promise<{ ok: true; file: string; size: number } | { ok: false; error: string }>
    delete(file: string): Promise<{ ok: true } | { ok: false; error: string }>
    validate(zipPath: string): Promise<BackupValidateResult>
  }

  diary: {
    /** 首次任意编辑变更时落一条新记录；throws：日期非法等 */
    ensureDraft(init?: DraftInit): Promise<{ id: string }>
    /** 返回新 rev / updated_at；throws：日记不存在 */
    patch(id: string, patch: EntryPatch): Promise<{ rev: number; updated_at: string }>
    get(id: string): Promise<EntryDetail | null>
    today(): Promise<TodayItem[]>
    /** 全量替换该篇标签（按名字，自动建新标签）；throws：日记不存在 */
    setTags(id: string, names: string[]): Promise<{ tags: TagRef[]; rev: number; updated_at: string }>
    list(categoryId?: number | null): Promise<TimelineEntry[]>
    /** 软删 → 回收站 */
    softDelete(id: string): Promise<{ ok: boolean }>
    search(q: string, categoryId?: number | null): Promise<TimelineEntry[]>
    range(fromDay: string, toDay: string): Promise<RangeEntry[]>
    /** 最近一篇的天气；无日记时 null */
    latestWeather(): Promise<number | null>
  }

  category: {
    list(): Promise<CategoryWithCount[]>
    reorder(ids: number[]): Promise<{ ok: true }>
    /** throws：名称为空 / 颜色格式不正确 */
    create(name: string, color: string): Promise<CategoryRow>
    /** throws：分类不存在 / 名称为空 */
    update(id: number, patch: CategoryPatch): Promise<{ ok: true }>
    /** throws：默认分类不可删除（code='DEFAULT_CAT'）；非空分类下日记移入默认分类 */
    remove(id: number): Promise<{ ok: true; moved: number }>
  }

  tag: {
    listAll(): Promise<TagWithUsed[]>
    /** throws：名称为空 / 已存在同名标签 */
    rename(id: number, name: string): Promise<{ ok: true }>
    /** throws：不能合并到自身 / 标签不存在 */
    merge(fromId: number, toId: number): Promise<{ ok: true }>
    /** throws：仍被日记使用（code='TAG_IN_USE'） */
    remove(id: number): Promise<{ ok: true }>
  }

  media: {
    pickAndAdd(entryId: string): Promise<{ added: MediaRow[]; skipped: string[] }>
    addBuffer(entryId: string, name: string, buf: Uint8Array | ArrayBuffer): Promise<MediaRow>
    remove(id: string): Promise<{ ok: true } | { ok: false; error: string }>
    listAll(): Promise<AlbumMediaItem[]>
  }

  bin: {
    list(): Promise<BinItem[]>
    restore(id: string): Promise<{ ok: boolean }>
    purge(id: string): Promise<{ ok: true } | { ok: false; error: string }>
  }

  export: {
    preview(opts?: ExportOptions): Promise<ExportPreview>
    run(type: ExportType, opts?: ExportOptions): Promise<ExportRunResult>
    longImage(entryId: string): Promise<ExportRunResult>
    history(): Promise<ExportFileRow[]>
    deleteRecord(id: number): Promise<{ ok: true }>
    reveal(p: string): Promise<true>
  }

  import: {
    pick(): Promise<{ canceled: true } | ImportPickResult>
    run(mdPath: string): Promise<ImportRunResult>
  }

  papers: {
    list(): Promise<Paper[]>
    addImage(name?: string): Promise<{ canceled: true } | { ok: true; paper: Paper }>
    addGen(name: string, config: PaperGenInput): Promise<Paper & { config: PaperGenConfig }>
    remove(id: string): Promise<{ ok: true }>
  }
}

/* window.api 全局声明（渲染层 TS 代码直接使用） */
declare global {
  interface Window {
    api: SuhuiApi
  }
}
