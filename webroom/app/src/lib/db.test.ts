import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createUser } from "./auth";
import { ensureAppealsUniqueIndex, getDb, reconcileDuplicateOpenAppeals, resetDbForTests, runMigrations } from "./db";

process.env.WEBROOM_DB_PATH = ":memory:";

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

describe("theme_reports migration", () => {
  beforeEach(() => {
    resetDbForTests();
    const db = getDb();
    db.exec("ALTER TABLE theme_reports DROP COLUMN moderator_id");
    db.exec("ALTER TABLE theme_reports DROP COLUMN moderator_note");
    db.exec("ALTER TABLE theme_reports DROP COLUMN reviewed_at");
  });

  it("adds missing moderation columns via production migration", () => {
    const db = getDb();
    runMigrations(db);

    expect(columnExists(db, "theme_reports", "moderator_id")).toBe(true);
    expect(columnExists(db, "theme_reports", "moderator_note")).toBe(true);
    expect(columnExists(db, "theme_reports", "reviewed_at")).toBe(true);
  });
});

describe("appeals unique index migration", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    resetDbForTests();
    db = getDb();
    db.exec("DROP INDEX IF EXISTS idx_appeals_one_open_per_user");
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

    ensureAppealsUniqueIndex(db);

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

  it("reconcileDuplicateOpenAppeals is idempotent when no duplicates exist", () => {
    const userId = randomUUID();
    db.prepare(
      "INSERT INTO users (id, handle, handle_lower, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(userId, "blockeduser", "blockeduser", "hash", new Date().toISOString());
    db.prepare(
      "INSERT INTO appeals (id, user_id, appeal_type, reason, created_at, status) VALUES (?, ?, 'platform_block', ?, ?, 'open')",
    ).run(randomUUID(), userId, "only appeal", new Date().toISOString());

    expect(() => reconcileDuplicateOpenAppeals(db)).not.toThrow();
    expect(
      (
        db
          .prepare("SELECT COUNT(*) as c FROM appeals WHERE user_id = ? AND status = 'open'")
          .get(userId) as { c: number }
      ).c,
    ).toBe(1);
  });
});

describe("installed_plugins migration", () => {
  it("preserves legacy global installs for each existing user", () => {
    resetDbForTests();
    const db = getDb();
    db.exec("DROP TABLE IF EXISTS installed_plugins");
    db.exec(
      `CREATE TABLE installed_plugins (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        manifest_json TEXT NOT NULL,
        installed_at TEXT NOT NULL
      )`,
    );
    createUser("legacya", "correct-horse-battery");
    createUser("legacyb", "correct-horse-battery");
    db.prepare(
      "INSERT INTO installed_plugins (id, slug, manifest_json, installed_at) VALUES (?, ?, ?, ?)",
    ).run("legacy-plugin", "quote-card", '{"name":"Quote"}', "2025-01-01T00:00:00.000Z");

    runMigrations(db);

    expect(columnExists(db, "installed_plugins", "user_id")).toBe(true);
    const count = db.prepare("SELECT COUNT(*) as c FROM installed_plugins").get() as { c: number };
    expect(count.c).toBe(2);
    const slugs = db.prepare("SELECT DISTINCT slug FROM installed_plugins").all() as { slug: string }[];
    expect(slugs).toEqual([{ slug: "quote-card" }]);
  });

  it("preserves legacy table when no users exist yet", () => {
    resetDbForTests();
    const db = getDb();
    db.exec("DROP TABLE IF EXISTS installed_plugins");
    db.exec(
      `CREATE TABLE installed_plugins (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        manifest_json TEXT NOT NULL,
        installed_at TEXT NOT NULL
      )`,
    );
    db.prepare(
      "INSERT INTO installed_plugins (id, slug, manifest_json, installed_at) VALUES (?, ?, ?, ?)",
    ).run("legacy-plugin", "quote-card", '{"name":"Quote"}', "2025-01-01T00:00:00.000Z");

    runMigrations(db);

    expect(columnExists(db, "installed_plugins", "user_id")).toBe(false);
    const count = db.prepare("SELECT COUNT(*) as c FROM installed_plugins").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("migrates deferred legacy plugins when the first user is created", () => {
    resetDbForTests();
    const db = getDb();
    db.exec("DROP TABLE IF EXISTS installed_plugins");
    db.exec(
      `CREATE TABLE installed_plugins (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        manifest_json TEXT NOT NULL,
        installed_at TEXT NOT NULL
      )`,
    );
    db.prepare(
      "INSERT INTO installed_plugins (id, slug, manifest_json, installed_at) VALUES (?, ?, ?, ?)",
    ).run("legacy-plugin", "quote-card", '{"name":"Quote"}', "2025-01-01T00:00:00.000Z");

    createUser("firstuser", "correct-horse-battery");

    expect(columnExists(db, "installed_plugins", "user_id")).toBe(true);
    const count = db.prepare("SELECT COUNT(*) as c FROM installed_plugins").get() as { c: number };
    expect(count.c).toBe(1);
    const slug = db.prepare("SELECT slug FROM installed_plugins LIMIT 1").get() as { slug: string };
    expect(slug.slug).toBe("quote-card");
  });
});
