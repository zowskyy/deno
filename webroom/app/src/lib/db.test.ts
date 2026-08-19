import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function migrateThemeReportColumns(db: DatabaseSync): void {
  if (!columnExists(db, "theme_reports", "moderator_id")) {
    db.exec("ALTER TABLE theme_reports ADD COLUMN moderator_id TEXT");
  }
  if (!columnExists(db, "theme_reports", "moderator_note")) {
    db.exec("ALTER TABLE theme_reports ADD COLUMN moderator_note TEXT");
  }
  if (!columnExists(db, "theme_reports", "reviewed_at")) {
    db.exec("ALTER TABLE theme_reports ADD COLUMN reviewed_at TEXT");
  }
}

describe("theme_reports migration", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    db.exec(schema);
    db.exec("ALTER TABLE theme_reports DROP COLUMN moderator_note");
    db.exec("ALTER TABLE theme_reports DROP COLUMN reviewed_at");
  });

  it("adds missing moderation columns when only moderator_id exists", () => {
    migrateThemeReportColumns(db);

    expect(columnExists(db, "theme_reports", "moderator_id")).toBe(true);
    expect(columnExists(db, "theme_reports", "moderator_note")).toBe(true);
    expect(columnExists(db, "theme_reports", "reviewed_at")).toBe(true);
  });
});
