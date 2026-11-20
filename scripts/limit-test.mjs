/* ============================================================
   150 篇/日上限 —— 人工验收辅助脚本（Phase 1 测试清单第 9 项）
   用法：
     node scripts/limit-test.mjs add    # 造 149 篇今日测试条目（正文带标记）
     node scripts/limit-test.mjs clear  # 删除全部测试条目
   注意：请在应用运行时或关闭时均可执行（WAL 支持短暂并发写）
   ============================================================ */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

const MARK = '__LIMIT_TEST__'
const dbPath = path.join(process.env.APPDATA, 'suhui-desktop', 'suhui.db')
if (!fs.existsSync(dbPath)) {
  console.error('未找到数据库：' + dbPath)
  process.exit(1)
}
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

const cmd = process.argv[2]

if (cmd === 'add') {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const nowStr = `${day}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const ins = db.prepare(
    `INSERT INTO entries
       (id, title, content, occurred_at, created_at, updated_at, year_month, day, weekday, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  )
  const add = db.transaction((n) => {
    for (let i = 0; i < n; i++) {
      ins.run(randomUUID(), `[上限测试 ${i + 1}]`, MARK, nowStr, nowStr, nowStr, day.slice(0, 7), day, now.getDay())
    }
  })
  add(149)
  const c = db.prepare('SELECT COUNT(*) c FROM entries WHERE substr(created_at,1,10)=?').get(day).c
  console.log(`已造 149 篇测试条目，今日总数 = ${c}（再新增 1 篇即触发 150 上限）`)
} else if (cmd === 'clear') {
  const r = db.prepare('DELETE FROM entries WHERE content = ?').run(MARK)
  console.log(`已删除 ${r.changes} 篇测试条目`)
} else {
  console.log('用法：node scripts/limit-test.mjs add | clear')
}

db.close()
