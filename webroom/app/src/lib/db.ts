import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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

/** Restore legacy installed_plugins table after a failed migration attempt. */
function restoreLegacyInstalledPluginsTable(db: DatabaseSync): void {
  const legacy = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'installed_plugins_legacy'")
    .get() as { name: string } | undefined;
  if (!legacy) return;
  const current = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'installed_plugins'")
    .get() as { name: string } | undefined;
  if (current) db.exec("DROP TABLE installed_plugins");
  db.exec("ALTER TABLE installed_plugins_legacy RENAME TO installed_plugins");
}

/** Upgrade legacy global plugin installs to per-user ownership. */
function migrateInstalledPluginsIfNeeded(db: DatabaseSync): void {
  const legacyTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'installed_plugins'")
    .get() as { name: string } | undefined;
  if (!legacyTable || columnExists(db, "installed_plugins", "user_id")) return;

  const legacyRows = db
    .prepare("SELECT id, slug, manifest_json, installed_at FROM installed_plugins")
    .all() as { id: string; slug: string; manifest_json: string; installed_at: string }[];

  if (legacyRows.length > 0) {
    const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
    if (userCount === 0) return;
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("ALTER TABLE installed_plugins RENAME TO installed_plugins_legacy");
    db.exec(
      `CREATE TABLE installed_plugins (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slug TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        installed_at TEXT NOT NULL,
        UNIQUE (user_id, slug)
      )`,
    );
    db.exec("CREATE INDEX IF NOT EXISTS idx_installed_plugins_user ON installed_plugins(user_id, installed_at)");
    if (legacyRows.length > 0) {
      const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
      const insert = db.prepare(
        `INSERT INTO installed_plugins (id, user_id, slug, manifest_json, installed_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const user of users) {
        for (const row of legacyRows) {
          insert.run(randomUUID(), user.id, row.slug, row.manifest_json, row.installed_at);
        }
      }
    }
    db.exec("DROP TABLE IF EXISTS installed_plugins_legacy");
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore rollback errors */
    }
    restoreLegacyInstalledPluginsTable(db);
    throw error;
  }
}

/** Re-run deferred migrations after the first user account is created. */
export function resumeDeferredMigrations(db: DatabaseSync): void {
  const legacyTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'installed_plugins'")
    .get() as { name: string } | undefined;
  if (!legacyTable || columnExists(db, "installed_plugins", "user_id")) return;

  const legacyCount = (db.prepare("SELECT COUNT(*) as c FROM installed_plugins").get() as { c: number }).c;
  if (legacyCount === 0) return;

  migrateInstalledPluginsIfNeeded(db);
  if (columnExists(db, "installed_plugins", "user_id") && !indexExists(db, "idx_installed_plugins_user")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_installed_plugins_user ON installed_plugins(user_id, installed_at)");
  }
}

/** Apply schema bootstrap and incremental migrations. */
function migrate(db: DatabaseSync): void {
  migrateInstalledPluginsIfNeeded(db);

  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  if (columnExists(db, "installed_plugins", "user_id") && !indexExists(db, "idx_installed_plugins_user")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_installed_plugins_user ON installed_plugins(user_id, installed_at)");
  }

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
  // Let concurrent BEGIN IMMEDIATE transactions (rate limiting, appeal and
  // report review) wait for a held write lock instead of failing instantly
  // with SQLITE_BUSY under normal contention.
  dbInstance.exec("PRAGMA busy_timeout = 5000;");
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
