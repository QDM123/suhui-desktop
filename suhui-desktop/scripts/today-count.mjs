/* 诊断：查看今日日记篇数 */
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

const dbPath = path.join(process.env.APPDATA, 'suhui-desktop', 'suhui.db')
if (!fs.existsSync(dbPath)) {
  console.log('未找到数据库：', dbPath)
  process.exit(1)
}
const db = new Database(dbPath, { readonly: true })
const r = db.prepare(
  "SELECT COUNT(*) c FROM entries WHERE deleted = 0 AND substr(occurred_at, 1, 10) = date('now', 'localtime')"
).get()
console.log('数据库:', dbPath)
console.log('今日篇数:', r.c)
