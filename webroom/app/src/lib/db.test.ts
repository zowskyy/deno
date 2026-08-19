import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { reconcileDuplicateOpenAppeals } from "./db";

const __dirname = dirname(fileURLToPath(import.meta.url));

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function indexExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(name) as
    | { name: string }
    | undefined;
  return !!row;
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

function createAppealsIndex(db: DatabaseSync): void {
  reconcileDuplicateOpenAppeals(db);
  db.exec(
    "CREATE UNIQUE INDEX idx_appeals_one_open_per_user ON appeals(user_id) WHERE status = 'open'",
  );
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

describe("appeals unique index migration", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    db.exec(schema);
    db.exec("PRAGMA foreign_keys = ON;");
  });

  it("reconciles duplicate open appeals before creating the unique index", () => {
    const userId = randomUUID();
    db.prepare(
      "INSERT INTO users (id, handle, handle_lower, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(userId, "blockeduser", "blockeduser", "hash", new Date().toISOString());

    const older = randomUUID();
    const newer = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO appeals (id, user_id, appeal_type, reason, created_at, status) VALUES (?, ?, 'platform_block', ?, ?, 'open')",
    ).run(older, userId, "first appeal", "2020-01-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO appeals (id, user_id, appeal_type, reason, created_at, status) VALUES (?, ?, 'platform_block', ?, ?, 'open')",
    ).run(newer, userId, "second appeal", now);

    createAppealsIndex(db);

    expect(indexExists(db, "idx_appeals_one_open_per_user")).toBe(true);
    const open = db
      .prepare("SELECT id, status FROM appeals WHERE user_id = ? AND status = 'open'")
      .all(userId) as { id: string; status: string }[];
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe(older);

    const dismissed = db
      .prepare("SELECT status, moderator_note FROM appeals WHERE id = ?")
      .get(newer) as { status: string; moderator_note: string };
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.moderator_note).toContain("duplicate open appeal");
  });
});
