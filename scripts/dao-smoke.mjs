/* ============================================================
   DAO 冒烟测试（Phase 1）—— 纯 Node 环境直测数据层
   用法：npm run test:dao
   ============================================================ */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { runMigrations } from '../electron/db/migrate.mjs'
import { createDao } from '../electron/db/dao.mjs'

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
ok(v === 2, `user_version = 2（实际 ${v}）`)
ok(db.prepare('SELECT COUNT(*) c FROM categories').get().c === 4, '预置 4 个分类')
ok(!!db.prepare("SELECT name FROM sqlite_master WHERE name='entries'").get(), 'entries 表存在')
ok(!!db.prepare("SELECT name FROM sqlite_master WHERE name='media'").get(), 'media 表存在')

const dao = createDao(db, mediaDir, { dailyLimit: 3 })
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

console.log('\n[7] 每日上限（dailyLimit=3，当前已建 3 篇今日条目）')
let limited = false
try { dao.ensureDraft({}) } catch (e) { limited = e.code === 'DAILY_LIMIT' && e.message === '每日新增日记超过150篇限制' }
ok(limited, '超限抛出实证文案')

console.log(`\n结果：${passed} 通过，${failed} 失败`)
db.close()
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
