import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Directory containing schema.sql for database initialization. */
const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance: DatabaseSync | undefined;

/** Return whether a table column exists in the current schema. */
function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/** Return whether a named SQLite index exists. */
function indexExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(name) as
    | { name: string }
    | undefined;
  return !!row;
}

/** Dismiss duplicate open appeals, keeping the oldest per user. */
export function reconcileDuplicateOpenAppeals(db: DatabaseSync): void {
  const duplicates = db
    .prepare(
      `SELECT user_id
       FROM appeals
       WHERE status = 'open'
       GROUP BY user_id
       HAVING COUNT(*) > 1`,
    )
    .all() as { user_id: string }[];

  for (const { user_id } of duplicates) {
    const rows = db
      .prepare(
        `SELECT id FROM appeals
         WHERE user_id = ? AND status = 'open'
         ORDER BY created_at ASC`,
      )
      .all(user_id) as { id: string }[];

    for (let i = 1; i < rows.length; i++) {
      db.prepare(
        `UPDATE appeals
         SET status = 'dismissed',
             moderator_note = 'Superseded during migration — duplicate open appeal.'
         WHERE id = ?`,
      ).run(rows[i]!.id);
    }
  }
}

/** Apply schema bootstrap and incremental migrations. */
function migrate(db: DatabaseSync): void {
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  // Incremental migrations for existing databases.
  if (!columnExists(db, "users", "is_moderator")) {
    db.exec("ALTER TABLE users ADD COLUMN is_moderator INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnExists(db, "page_documents", "draft_document_json")) {
    db.exec("ALTER TABLE page_documents ADD COLUMN draft_document_json TEXT");
  }
  if (!columnExists(db, "page_documents", "guestbook_disabled")) {
    db.exec("ALTER TABLE page_documents ADD COLUMN guestbook_disabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnExists(db, "reports", "moderator_id")) {
    db.exec("ALTER TABLE reports ADD COLUMN moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL");
    db.exec("ALTER TABLE reports ADD COLUMN moderator_note TEXT");
    db.exec("ALTER TABLE reports ADD COLUMN reviewed_at TEXT");
  }
  if (!columnExists(db, "theme_reports", "moderator_id")) {
    db.exec("ALTER TABLE theme_reports ADD COLUMN moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  }
  if (!columnExists(db, "theme_reports", "moderator_note")) {
    db.exec("ALTER TABLE theme_reports ADD COLUMN moderator_note TEXT");
  }
  if (!columnExists(db, "theme_reports", "reviewed_at")) {
    db.exec("ALTER TABLE theme_reports ADD COLUMN reviewed_at TEXT");
  }
  if (!indexExists(db, "idx_appeals_one_open_per_user")) {
    ensureAppealsUniqueIndex(db);
  }
}

/** Reconcile duplicate open appeals and create the one-open-per-user unique index. */
export function ensureAppealsUniqueIndex(db: DatabaseSync): void {
  reconcileDuplicateOpenAppeals(db);
  db.exec(
    "CREATE UNIQUE INDEX idx_appeals_one_open_per_user ON appeals(user_id) WHERE status = 'open'",
  );
}

/** Re-run schema bootstrap and incremental migrations (for tests and upgrades). */
export function runMigrations(db: DatabaseSync): void {
  migrate(db);
}

/** Return the shared SQLite database instance, initializing it on first use. */
export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const path = process.env.WEBROOM_DB_PATH ?? join(__dirname, "..", "..", "webroom.db");
  dbInstance = new DatabaseSync(path);
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  migrate(dbInstance);
  return dbInstance;
}

/** Close and clear the database singleton for test isolation. */
export function resetDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = undefined;
  }
}
