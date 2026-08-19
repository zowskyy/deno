import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// node:sqlite is experimental as of Node 22 — tracked deliberately, not an
// oversight. It's used here specifically because it needs zero native
// compilation and zero external service, matching the same
// "no external dependency the user has to provision" principle as
// gateway-probe's SQLite event store. Swappable later behind this same
// module if we outgrow it (e.g. move to Postgres for real concurrent
// multi-writer scale) without touching call sites.

const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance: DatabaseSync | undefined;

function migrate(db: DatabaseSync): void {
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);
}

/**
 * Returns the shared database connection, opening and migrating it on
 * first use. Path comes from WEBROOM_DB_PATH so tests can point at an
 * isolated file (or :memory:) without touching the dev/prod database.
 */
export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const path = process.env.WEBROOM_DB_PATH ?? join(__dirname, "..", "..", "webroom.db");
  dbInstance = new DatabaseSync(path);
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  migrate(dbInstance);
  return dbInstance;
}

/** Test-only: force a fresh connection (new WEBROOM_DB_PATH) on next getDb(). */
export function resetDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = undefined;
  }
}
