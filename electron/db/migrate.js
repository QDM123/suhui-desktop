/* ============================================================
   版本化迁移框架：PRAGMA user_version，只增不改
   每个迁移一个版本号，事务内执行 DDL
   ============================================================ */

const MIGRATIONS = [
  {
    version: 1,
    name: 'settings-table',
    up: [
      `CREATE TABLE IF NOT EXISTS settings (
         key   TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`
    ]
  }
  /* Phase 1 起追加：entries/categories/tags/entry_tags/media 等全量 schema */
]

export function runMigrations(db) {
  const current = db.pragma('user_version', { simple: true })
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      const apply = db.transaction(() => {
        for (const sql of m.up) db.exec(sql)
        db.pragma(`user_version = ${m.version}`)
      })
      apply()
    }
  }
  return db.pragma('user_version', { simple: true })
}
