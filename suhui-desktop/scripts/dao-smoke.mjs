/* ============================================================
   DAO 冒烟测试（Phase 1）—— 纯 Node 环境直测数据层
   用法：npm run test:dao
   ============================================================ */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { runMigrations } from '../electron/db/migrate.ts'
import { createDao, localDay, localDateTime } from '../electron/db/dao.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓', name) }
  else { failed++; console.error('  ✗', name) }
}

/* 最小合法 PNG（1x1 透明） */
const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082',
  'hex'
)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'suhui-dao-smoke-'))
const mediaDir = path.join(tmp, 'media')
const db = new Database(path.join(tmp, 'suhui.db'))
db.pragma('journal_mode = WAL')

console.log('\n[1] 迁移')
const v = runMigrations(db)
ok(v === 4, `user_version = 4（实际 ${v}）`)
ok(db.prepare('SELECT COUNT(*) c FROM categories').get().c === 4, '预置 4 个分类')
ok(!!db.prepare("SELECT name FROM sqlite_master WHERE name='entries'").get(), 'entries 表存在')
ok(!!db.prepare("SELECT name FROM sqlite_master WHERE name='media'").get(), 'media 表存在')

const dao = createDao(db, mediaDir)
console.log('\n[2] ensureDraft / 派生字段')
const { id } = dao.ensureDraft({
  title: '测试', content: '第一行\n第二行', occurredDay: '2026-11-01', occurredTime: '09:30',
  weather: 4, mood: 2, category_id: 2, address: '家里', background: 'paper-3'
})
const e1 = dao.getEntry(id).entry
ok(e1.title === '测试', 'title 保存')
ok(e1.year_month === '2026-11', 'year_month 派生')
ok(e1.day === '2026-11-01', 'day 派生')
ok(e1.weekday === 0, 'weekday 派生（2026-11-01 = 周日 = 0）')
ok(e1.rev === 1, '新建 rev = 1')
ok(e1.occurred_at === '2026-11-01T09:30:00', 'occurred_at 组装')

console.log('\n[3] patchEntry')
const p1 = dao.patchEntry(id, { title: '改名' })
ok(p1.rev === 2, 'patch 后 rev+1')
const p2 = dao.patchEntry(id, { occurred_at: '2026-11-02T10:00:00' })
const e2 = dao.getEntry(id).entry
ok(e2.day === '2026-11-02' && e2.weekday === 1, '日期变更联动 day/weekday')
ok(p2.rev === 3, 'rev 继续递增')
const p3 = dao.patchEntry(id, { hacker: 1, mood: null })
ok(p3.rev === 4 && 'hacker' in e2 === false, '白名单外字段被忽略')

console.log('\n[4] 标签')
const tr = dao.setTags(id, ['猫', '随笔', '猫'])
ok(tr.tags.length === 2, '标签去重')
ok(tr.rev === 5, '标签变更 rev+1')
const tr2 = dao.setTags(id, ['猫'])
ok(tr2.tags.length === 1, '全量替换生效')
const allT = dao.listAllTags()
ok(allT.find((t) => t.name === '随笔').used === 0, '解绑标签 used=0')

console.log('\n[5] 媒体（原图字节直存）')
const src = path.join(tmp, '源图.png')
fs.writeFileSync(src, PNG_1PX)
const r1 = dao.addMediaFile(id, src)
ok(!!r1.added, 'addMediaFile 成功')
const stored = path.join(mediaDir, r1.added.file_name)
ok(fs.readFileSync(stored).equals(PNG_1PX), '文件字节一致（未压缩）')
ok(r1.added.orig_name === '源图.png', '保留原始文件名')
const r2 = dao.addMediaBuffer(id, '粘贴.png', PNG_1PX)
ok(fs.readFileSync(path.join(mediaDir, r2.file_name)).equals(PNG_1PX), '粘贴字节一致')
ok(dao.getEntry(id).media.length === 2, '媒体按 sort 排序')
const rm = dao.removeMedia(r1.added.id)
ok(rm.ok && !fs.existsSync(stored), '删除媒体：记录与文件同步移除')
fs.writeFileSync(path.join(tmp, 'x.txt'), 'hi')
ok(!!dao.addMediaFile(id, path.join(tmp, 'x.txt')).skipped, '非图片扩展名被跳过')

console.log('\n[6] 列表 / 最近地址 / 标题占位')
dao.ensureDraft({ title: '今天的' })
const today = dao.listToday()
ok(today.some((t) => t.title === '今天的'), 'listToday 返回今日条目')
dao.ensureDraft({ address: '公司' })
const addr = dao.recentAddresses()
ok(addr.includes('公司') && addr.includes('家里'), '最近地址去重汇集')

console.log('\n[7] 每日篇数（已移除每日上限）')
dao.ensureDraft({ title: '今日第三篇' })
dao.ensureDraft({ title: '今日第四篇' })
ok(dao.countToday() >= 4, '同日连续多篇无上限')

console.log('\n[8] Phase 2：时间轴列表 / 软删')
const before = dao.listEntries().length
const item = dao.listEntries().find((x) => x.id === id)
ok(!!item && item.category_name === '工作' && item.tags.includes('猫'), 'listEntries 附分类名与标签')
ok(item.media_count === 1, 'media_count 统计')
const filtered = dao.listEntries(2)
ok(filtered.length > 0 && filtered.every((x) => x.category_id === 2), '分类过滤生效')
ok(dao.listEntries()[0].occurred_at >= dao.listEntries().at(-1).occurred_at, '按时间倒序')
const del = dao.softDelete(id)
ok(del.ok && dao.listEntries().length === before - 1, '软删后从列表消失')
ok(dao.getEntry(id).entry.deleted === 1, 'deleted=1 落库（回收站可恢复）')
ok(!dao.softDelete(id).ok, '重复软删返回 false')

console.log('\n[9] Phase 3：搜索（FTS5 trigram + LIKE 兜底）')
const dao2 = createDao(db, mediaDir)
const sA = dao2.ensureDraft({ title: '海边旅行记', content: '今天去了海边，浪花很美，心情舒畅。' }).id
dao2.setTags(sA, ['大海'])
const sB = dao2.ensureDraft({ title: '工作笔记', content: '开会讨论了项目排期。', category_id: 2 }).id
let r9 = dao2.searchEntries('海边')
ok(r9.some((x) => x.id === sA) && !r9.some((x) => x.id === sB), '2 字中文命中标题（LIKE 兜底）')
r9 = dao2.searchEntries('浪花很美')
ok(r9.some((x) => x.id === sA), '≥3 字命中正文（FTS trigram）')
r9 = dao2.searchEntries('大海')
ok(r9.some((x) => x.id === sA), '标签名命中')
r9 = dao2.searchEntries('')
ok(r9.length === dao2.listEntries().length, '空词=全量列表')
dao2.patchEntry(sB, { content: '会后散步，也看到浪花很美的一幕。' })
r9 = dao2.searchEntries('浪花很美', 2)
ok(r9.length === 1 && r9[0].id === sB, '内容更新 FTS 触发器联动 + 分类过滤叠加')

console.log('\n[10] Phase 3：分类管理')
const lifeCat = dao2.listCategories().find((c) => c.id === 1)
ok(lifeCat && lifeCat.name === '生活' && lifeCat.entry_count >= 0, 'listCategories 含条目数')
const nc = dao2.createCategory('宠物', '#e05a7a')
dao2.patchEntry(sA, { category_id: nc.id })
ok(dao2.listCategories().find((c) => c.id === nc.id).entry_count === 1, '新分类计数联动')
dao2.updateCategory(nc.id, { name: '萌宠' })
ok(dao2.listEntries(nc.id)[0].category_name === '萌宠', '改名即时生效')
let blockedCat = false
try { dao2.deleteCategory(1) } catch (e) { blockedCat = e.code === 'DEFAULT_CAT' }
ok(blockedCat, '默认分类不可删除')
const delCat = dao2.deleteCategory(nc.id)
ok(delCat.moved === 1, '删除非空分类返回移动数')
ok(dao2.getEntry(sA).entry.category_id === 1, '其日记归入「生活」')
const beforeOrder = dao2.listCategories().map((c) => c.id)
dao2.reorderCategories([...beforeOrder].reverse())
ok(
  dao2.listCategories().map((c) => c.id).join() === [...beforeOrder].reverse().join(),
  '拖拽排序落库并影响列表顺序'
)

console.log('\n[11] Phase 3：标签管理')
dao2.setTags(sA, ['大海', '旅行'])
dao2.setTags(sB, ['大海'])
ok(dao2.listAllTags().find((t) => t.name === '大海').used === 2, '引用计数正确')
const tagTravel = dao2.listAllTags().find((t) => t.name === '旅行')
dao2.renameTag(tagTravel.id, '旅途')
ok(dao2.getEntry(sA).tags.some((t) => t.name === '旅途'), '重命名全量生效')
let dupTag = false
try {
  const tagSea = dao2.listAllTags().find((t) => t.name === '大海')
  dao2.renameTag(tagSea.id, '旅途')
} catch (e) { dupTag = String(e.message).includes('同名') }
ok(dupTag, '重名拦截')
const sea2 = dao2.listAllTags().find((t) => t.name === '大海')
const trip2 = dao2.listAllTags().find((t) => t.name === '旅途')
dao2.mergeTags(sea2.id, trip2.id)
const afterMerge = dao2.listAllTags()
ok(!afterMerge.some((t) => t.name === '大海') && afterMerge.find((t) => t.name === '旅途').used === 2, '合并并去重')
let inUse = false
try { dao2.deleteTag(trip2.id) } catch (e) { inUse = e.code === 'TAG_IN_USE' }
ok(inUse, '使用中标签不可删除')
dao2.setTags(sB, ['临时'])
dao2.setTags(sB, [])
const orphan = dao2.listAllTags().find((t) => t.name === '临时')
ok(orphan && orphan.used === 0, '解绑后成孤儿')
dao2.deleteTag(orphan.id)
ok(!dao2.listAllTags().some((t) => t.name === '临时'), '孤儿标签可删除')

console.log('\n[12] Phase 4：日期范围 / 最近天气')
const rng = dao2.entriesInRange(localDay().slice(0, 8) + '01', localDay())
ok(rng.length >= 3 && rng.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.day)), 'entriesInRange 返回带 day')
ok(rng[0].day <= rng[rng.length - 1].day, '按日升序')
ok(rng.every((x) => x.title && x.time), '条目含标题占位与时间')
ok(dao2.latestWeather() === 1 || dao2.latestWeather() === null || Number.isInteger(dao2.latestWeather()), 'latestWeather 返回枚举/空')
const withW = dao2.ensureDraft({ weather: 7 })
ok(dao2.latestWeather() === 7, 'latestWeather 取最近一篇')

console.log('\n[13] Phase 5：相册 / 回收站 / 30 天清理')
const pId = dao2.ensureDraft({ title: '相册测试', content: '带图的日记' }).id
dao2.addMediaBuffer(pId, 'a1.png', PNG_1PX)
dao2.addMediaBuffer(pId, 'a2.png', PNG_1PX)
ok(dao2.listAllMedia().some((m) => m.entry_id === pId), '相册自动汇集新日记媒体')
dao2.softDelete(pId)
ok(!dao2.listAllMedia().some((m) => m.entry_id === pId), '删除日记后图片从相册消失')
const delRow = dao2.listDeleted().find((x) => x.id === pId)
ok(!!delRow && delRow.contentLen === '带图的日记'.length, '回收站列表含字数')
ok(dao2.restore(pId).ok && !dao2.listDeleted().some((x) => x.id === pId), '恢复成功移出回收站')
const oldId = dao2.ensureDraft({ title: '过期的' }).id
dao2.softDelete(oldId)
db.prepare('UPDATE entries SET deleted_at = ? WHERE id = ?')
  .run(localDateTime(new Date(Date.now() - 32 * 86400000)), oldId)
const keepId = dao2.ensureDraft({ title: '五天前的' }).id
dao2.softDelete(keepId)
db.prepare('UPDATE entries SET deleted_at = ? WHERE id = ?')
  .run(localDateTime(new Date(Date.now() - 5 * 86400000)), keepId)
const cl = dao2.cleanupExpired()
ok(cl.purged >= 1 && !dao2.getEntry(oldId), '超 30 天启动清理')
ok(dao2.getEntry(keepId) && dao2.listDeleted().some((x) => x.id === keepId), '30 天内不清理')
const firstMedia = dao2.getEntry(pId).media[0]
const fp = path.join(mediaDir, firstMedia.file_name)
ok(fs.existsSync(fp), '媒体文件在盘')
dao2.softDelete(pId)
const pg = dao2.purge(pId)
ok(pg.ok && !dao2.getEntry(pId) && !fs.existsSync(fp), '彻底删除：记录与文件全清')

console.log('\n[14] Phase 7：导出取数 / 导出历史')
const fx = dao2.listForExport({ categoryIds: [1] })
ok(fx.length > 0 && fx.every((x) => x.category_id === 1), '按分类取数')
ok(fx[0].occurred_at <= fx[fx.length - 1].occurred_at, '时间正序（导出编排）')
const fxAll = dao2.listForExport({})
ok(Array.isArray(fxAll[0].tags) && Array.isArray(fxAll[0].media), '附标签与媒体')
const fxD = dao2.listForExport({ fromDay: localDay(), toDay: localDay() })
ok(fxD.every((x) => x.day === localDay()), '日期范围过滤')
const rec = dao2.addExportFile('pdf', 'D:/tmp/test.pdf', 12345)
ok(rec.id > 0 && rec.type === 'pdf', '记录导出文件')
ok(dao2.listExportFiles()[0].id === rec.id, '历史倒序')
dao2.deleteExportFile(rec.id)
ok(!dao2.listExportFiles().some((x) => x.id === rec.id), '删除导出记录')

console.log(`\n结果：${passed} 通过，${failed} 失败`)
db.close()
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
