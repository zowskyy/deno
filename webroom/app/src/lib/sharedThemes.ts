import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { logModeratorAction } from "./moderation";
import type { PageDocument } from "./pageDocumentTypes";

/** Community theme package with metadata and installable theme data. */
export interface SharedTheme {
  id: string;
  creatorHandle: string;
  name: string;
  description: string;
  tags: string[];
  version: number;
  forkedFromId: string | null;
  attributionHandle: string | null;
  themeData: PageDocument["theme"];
  createdAt: string;
  updatedAt: string;
}

/** Insert default shared themes when the table is empty. */
export function ensureSeedSharedThemes(): void {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM shared_themes").get() as { c: number };
  if (count.c > 0) return;

  const now = new Date().toISOString();
  const seeds = [
    { name: "Y2K Chrome", description: "Glossy panels, cool blues, reflective accents.", tags: ["y2k", "glossy"], template: "chrome-angel" as const, accent: "#0284c7", background: "#dbeafe", fontStyle: "sans" as const },
    { name: "Scene Neon", description: "Hot pink and electric purple nightlife energy.", tags: ["scene", "neon"], template: "chrome-angel" as const, accent: "#ff4db8", background: "#160a23", fontStyle: "sans" as const },
    { name: "Pixel RPG Tavern", description: "Retro dungeon menu vibes.", tags: ["pixel", "rpg"], template: "pixel-tavern" as const, accent: "#c7314b", background: "#241b2e", fontStyle: "mono" as const },
    { name: "Soft Angelcore", description: "Dreamy pastels and gentle serif type.", tags: ["soft", "angelcore"], template: "soft-web" as const, accent: "#e0526b", background: "#f6ecec", fontStyle: "serif" as const },
    { name: "CRT Terminal", description: "Green phosphor on near-black.", tags: ["crt", "terminal"], template: "dark-zine" as const, accent: "#7fbe95", background: "#0e0e0e", fontStyle: "mono" as const },
    { name: "Indie Devlog", description: "Clean, readable, maker-focused.", tags: ["devlog", "minimal"], template: "clean-portfolio" as const, accent: "#2563eb", background: "#ffffff", fontStyle: "sans" as const },
    { name: "Zine Punk", description: "High contrast cut-and-paste energy.", tags: ["zine", "punk"], template: "dark-zine" as const, accent: "#f1eaee", background: "#0e0e0e", fontStyle: "serif" as const },
    { name: "Minimal Reader", description: "Maximum readability, minimum noise.", tags: ["minimal", "reader"], template: "start-simple" as const, accent: "#241b2e", background: "#f1ede9", fontStyle: "sans" as const },
  ];

  for (const seed of seeds) {
    const themeData = {
      template: seed.template,
      accent: seed.accent,
      background: seed.background,
      density: "comfortable" as const,
      fontStyle: seed.fontStyle,
      reduceMotion: false,
      customCss: "",
      customCssEnabled: false,
      attribution: undefined,
    };
    db.prepare(
      `INSERT INTO shared_themes (id, creator_user_id, name, description, tags_json, version, theme_json, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(randomUUID(), seed.name, seed.description, JSON.stringify(seed.tags), JSON.stringify(themeData), now, now);
  }
}

/** List shared themes, seeding defaults when needed. */
export function listSharedThemes(limit = 50): SharedTheme[] {
  ensureSeedSharedThemes();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT st.id, st.name, st.description, st.tags_json, st.version, st.theme_json,
              st.forked_from_id, st.attribution_handle, st.created_at, st.updated_at,
              COALESCE(u.handle, 'webroom') as creator_handle
       FROM shared_themes st
       LEFT JOIN users u ON u.id = st.creator_user_id
       ORDER BY st.updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map(rowToTheme);
}

/** Load one shared theme by id. */
export function getSharedTheme(id: string): SharedTheme | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT st.id, st.name, st.description, st.tags_json, st.version, st.theme_json,
              st.forked_from_id, st.attribution_handle, st.created_at, st.updated_at,
              COALESCE(u.handle, 'webroom') as creator_handle
       FROM shared_themes st
       LEFT JOIN users u ON u.id = st.creator_user_id
       WHERE st.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToTheme(row) : null;
}

/** Convert a theme_reports row into a SharedTheme record. */
function rowToTheme(row: Record<string, unknown>): SharedTheme {
  return {
    id: row.id as string,
    creatorHandle: row.creator_handle as string,
    name: row.name as string,
    description: row.description as string,
    tags: JSON.parse((row.tags_json as string) || "[]") as string[],
    version: row.version as number,
    forkedFromId: (row.forked_from_id as string) ?? null,
    attributionHandle: (row.attribution_handle as string) ?? null,
    themeData: JSON.parse(row.theme_json as string) as PageDocument["theme"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Publish a theme to the shared gallery and record its first version. */
export function publishTheme(
  userId: string,
  handle: string,
  name: string,
  description: string,
  tags: string[],
  theme: PageDocument["theme"],
): string {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO shared_themes (id, creator_user_id, name, description, tags_json, version, theme_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(id, userId, name, description, JSON.stringify(tags), JSON.stringify(theme), now, now);
  db.prepare(
    "INSERT INTO theme_versions (id, theme_id, version, theme_json, created_at) VALUES (?, ?, 1, ?, ?)",
  ).run(randomUUID(), id, JSON.stringify(theme), now);
  return id;
}

/** Copy a shared theme into the user's gallery with attribution. */
export function forkTheme(userId: string, handle: string, sourceId: string): string {
  const source = getSharedTheme(sourceId);
  if (!source) throw new Error("Theme not found.");
  const theme = {
    ...source.themeData,
    attribution: {
      forkedFromThemeId: source.id,
      forkedFromHandle: source.creatorHandle,
      credit: `Theme forked from @${source.creatorHandle} — ${source.name}`,
    },
  };
  return publishTheme(userId, handle, `${source.name} (fork)`, `Forked from ${source.name}`, source.tags, theme);
}

/** Apply a shared theme to a page document with install attribution. */
export function installThemeOnDocument(document: PageDocument, theme: SharedTheme): PageDocument {
  return {
    ...document,
    theme: {
      ...theme.themeData,
      attribution: {
        forkedFromThemeId: theme.id,
        forkedFromHandle: theme.creatorHandle,
        credit: `Theme: ${theme.name} by @${theme.creatorHandle}`,
      },
    },
  };
}

/** List version history for a shared theme. */
export function listThemeVersions(themeId: string): { version: number; createdAt: string }[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT version, created_at FROM theme_versions WHERE theme_id = ? ORDER BY version DESC")
    .all(themeId) as { version: number; created_at: string }[];
  return rows.map((r) => ({ version: r.version, createdAt: r.created_at }));
}

/** File a moderation report against a shared theme. */
export function reportTheme(themeId: string, reporterId: string | null, reason: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO theme_reports (id, theme_id, reporter_id, reason, created_at, status) VALUES (?, ?, ?, ?, ?, 'open')",
  ).run(randomUUID(), themeId, reporterId, reason, new Date().toISOString());
}

/** Open theme report awaiting moderator review. */
export interface ThemeReportSummary {
  id: string;
  themeId: string;
  themeName: string;
  reason: string;
  createdAt: string;
  reporterHandle: string | null;
}

/** List open shared-theme reports for the moderation queue. */
export function listOpenThemeReports(limit = 50): ThemeReportSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT tr.id, tr.theme_id, st.name as theme_name, tr.reason, tr.created_at, u.handle as reporter_handle
       FROM theme_reports tr
       JOIN shared_themes st ON st.id = tr.theme_id
       LEFT JOIN users u ON u.id = tr.reporter_id
       WHERE tr.status = 'open'
       ORDER BY tr.created_at ASC
       LIMIT ?`,
    )
    .all(limit) as {
    id: string;
    theme_id: string;
    theme_name: string;
    reason: string;
    created_at: string;
    reporter_handle: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    themeId: r.theme_id,
    themeName: r.theme_name,
    reason: r.reason,
    createdAt: r.created_at,
    reporterHandle: r.reporter_handle,
  }));
}

/** Mark a theme report reviewed or dismissed. */
export function reviewThemeReport(
  reportId: string,
  moderatorId: string,
  status: "reviewed" | "dismissed",
  note: string,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare(
        "UPDATE theme_reports SET status = ?, moderator_id = ?, moderator_note = ?, reviewed_at = ? WHERE id = ? AND status = 'open'",
      )
      .run(status, moderatorId, note.trim() || null, now, reportId);
    if (result.changes === 0) {
      db.exec("ROLLBACK");
      return false;
    }

    logModeratorAction(moderatorId, `theme_report_${status}`, null, note);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
