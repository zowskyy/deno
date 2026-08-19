import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance: DatabaseSync | undefined;

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

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
    db.exec("ALTER TABLE theme_reports ADD COLUMN moderator_note TEXT");
    db.exec("ALTER TABLE theme_reports ADD COLUMN reviewed_at TEXT");
  }
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const path = process.env.WEBROOM_DB_PATH ?? join(__dirname, "..", "..", "webroom.db");
  dbInstance = new DatabaseSync(path);
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  migrate(dbInstance);
  return dbInstance;
}

export function resetDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = undefined;
  }
}
