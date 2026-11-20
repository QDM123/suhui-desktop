/* ============================================================
   版本化迁移框架：PRAGMA user_version，只增不改
   每个迁移一个版本号，事务内执行 DDL
   .mjs：ESM，既可被主进程打包，也可 node 直跑冒烟测试
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
  },
  {
    version: 2,
    name: 'core-schema-phase1',
    up: [
      `CREATE TABLE IF NOT EXISTS entries (
         id           TEXT PRIMARY KEY,
         title        TEXT NOT NULL DEFAULT '',
         content      TEXT NOT NULL DEFAULT '',
         occurred_at  TEXT NOT NULL,
         created_at   TEXT NOT NULL,
         updated_at   TEXT NOT NULL,
         year_month   TEXT NOT NULL,
         day          TEXT NOT NULL,
         weekday      INTEGER NOT NULL,
         category_id  INTEGER NOT NULL DEFAULT 1,
         weather      INTEGER NOT NULL DEFAULT 1,
         mood         INTEGER,
         address      TEXT NOT NULL DEFAULT '',
         background   TEXT NOT NULL DEFAULT 'paper-1',
         is_passby    INTEGER NOT NULL DEFAULT 0,
         praise_count INTEGER NOT NULL DEFAULT 0,
         deleted      INTEGER NOT NULL DEFAULT 0,
         deleted_at   TEXT,
         rev          INTEGER NOT NULL DEFAULT 0
       )`,
      `CREATE INDEX IF NOT EXISTS idx_entries_day ON entries(day)`,
      `CREATE INDEX IF NOT EXISTS idx_entries_ym  ON entries(year_month)`,
      `CREATE INDEX IF NOT EXISTS idx_entries_cat ON entries(category_id)`,
      `CREATE TABLE IF NOT EXISTS categories (
         id    INTEGER PRIMARY KEY AUTOINCREMENT,
         name  TEXT NOT NULL,
         color TEXT NOT NULL,
         sort  INTEGER NOT NULL DEFAULT 0
       )`,
      `INSERT INTO categories (name, color, sort) VALUES
         ('生活', '#00CCBB', 1),
         ('工作', '#8695B2', 2),
         ('旅行', '#f0885a', 3),
         ('读书', '#7b7fd0', 4)`,
      `CREATE TABLE IF NOT EXISTS tags (
         id   INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL UNIQUE
       )`,
      `CREATE TABLE IF NOT EXISTS entry_tags (
         entry_id TEXT NOT NULL,
         tag_id   INTEGER NOT NULL,
         PRIMARY KEY (entry_id, tag_id)
       )`,
      `CREATE TABLE IF NOT EXISTS media (
         id         TEXT PRIMARY KEY,
         entry_id   TEXT NOT NULL,
         file_name  TEXT NOT NULL,
         orig_name  TEXT,
         size       INTEGER,
         width      INTEGER,
         height     INTEGER,
         sort       INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_media_entry ON media(entry_id)`,
      `CREATE TABLE IF NOT EXISTS export_files (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         type       TEXT NOT NULL,
         path       TEXT NOT NULL,
         size       INTEGER,
         created_at TEXT NOT NULL
       )`
    ]
  },
  {
    version: 3,
    name: 'fts5-phase3',
    up: [
      /* trigram 分词：支持中文子串匹配（≥3 字走 FTS，短词由 DAO 回退 LIKE） */
      `CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
         title, content,
         content='entries', content_rowid='rowid',
         tokenize='trigram'
       )`,
      `CREATE TRIGGER IF NOT EXISTS entries_fts_ai AFTER INSERT ON entries BEGIN
         INSERT INTO entries_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
       END`,
      `CREATE TRIGGER IF NOT EXISTS entries_fts_ad AFTER DELETE ON entries BEGIN
         INSERT INTO entries_fts(entries_fts, rowid, title, content)
         VALUES ('delete', old.rowid, old.title, old.content);
       END`,
      `CREATE TRIGGER IF NOT EXISTS entries_fts_au AFTER UPDATE OF title, content ON entries BEGIN
         INSERT INTO entries_fts(entries_fts, rowid, title, content)
         VALUES ('delete', old.rowid, old.title, old.content);
         INSERT INTO entries_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
       END`,
      /* 存量数据回填 */
      `INSERT INTO entries_fts(rowid, title, content)
         SELECT rowid, title, content FROM entries
         WHERE rowid NOT IN (SELECT rowid FROM entries_fts)`
    ]
  },
  {
    version: 4,
    name: 'papers-diy',
    up: [
      `CREATE TABLE IF NOT EXISTS papers (
         id         TEXT PRIMARY KEY,
         name       TEXT NOT NULL,
         kind       TEXT NOT NULL,           -- image=上传图片 / gen=参数生成
         file_name  TEXT,                    -- image: papers/<uuid>.<ext>
         config     TEXT,                    -- gen: JSON {base, pattern, patternColor}
         created_at TEXT NOT NULL
       )`
    ]
  }
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
