import { z } from "zod";
import { getDb } from "./db";
import { randomUUID } from "node:crypto";

// The page document is Webroom's core structural idea, carried over from
// gateway-probe's report schema: a page is never a tiny custom website,
// it's a structured, versioned, validated document. This module is the
// single source of truth for that shape — nothing gets written to
// page_documents that hasn't passed PageDocumentSchema.parse() first.

export const CURRENT_SCHEMA_VERSION = 1;

const TEMPLATE_IDS = ["soft-web", "pixel-tavern", "chrome-angel", "dark-zine", "clean-portfolio", "start-simple"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const PAGE_PART_IDS = [
  "identity", "friends", "links", "now", "gallery", "blog",
  "devlog", "guestbook", "topEight", "badges",
] as const;
export type PagePartId = (typeof PAGE_PART_IDS)[number];

// Hex color only — never a raw CSS value, so a theme can't smuggle in
// `expression()`/url()/behavior tricks through a color field.
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color");

const ThemeSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  accent: hexColor,
  background: hexColor,
  density: z.enum(["cozy", "comfortable", "spacious"]).default("comfortable"),
});

const LinkItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  // Only http(s) URLs — never javascript:, data:, or other schemes that
  // could execute in the visitor's browser when clicked.
  url: z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "links must be http:// or https://",
  }),
});

const IdentitySchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(280),
  status: z.string().trim().max(80).optional(),
  avatarAssetId: z.string().uuid().optional(),
});

export const PageDocumentSchema = z.object({
  version: z.literal(CURRENT_SCHEMA_VERSION),
  identity: IdentitySchema,
  theme: ThemeSchema,
  pageParts: z.array(z.enum(PAGE_PART_IDS)).max(PAGE_PART_IDS.length),
  links: z.array(LinkItemSchema).max(30).default([]),
  now: z.string().trim().max(280).default(""),
});

export type PageDocument = z.infer<typeof PageDocumentSchema>;

export function defaultPageDocument(displayName: string): PageDocument {
  return {
    version: CURRENT_SCHEMA_VERSION,
    identity: { displayName, bio: "" },
    theme: { template: "start-simple", accent: "#e0526b", background: "#f1ede9", density: "comfortable" },
    pageParts: ["identity", "links", "now"],
    links: [],
    now: "",
  };
}

export class PageDocumentValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`Page document is invalid: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

/** Parses and validates untrusted input (e.g. a Studio form submission) into a PageDocument, or throws PageDocumentValidationError with plain-language issues. */
export function parsePageDocument(input: unknown): PageDocument {
  const result = PageDocumentSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new PageDocumentValidationError(issues);
  }
  return result.data;
}

export interface StoredPage {
  document: PageDocument;
  isPublished: boolean;
  visibility: "private" | "unlisted" | "public";
  hiddenFromDiscovery: boolean;
  updatedAt: string;
}

export function getPageDocument(userId: string): StoredPage | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT document_json, is_published, visibility, hidden_from_discovery, updated_at FROM page_documents WHERE user_id = ?",
    )
    .get(userId) as
    | { document_json: string; is_published: number; visibility: string; hidden_from_discovery: number; updated_at: string }
    | undefined;
  if (!row) return null;
  return {
    document: parsePageDocument(JSON.parse(row.document_json)),
    isPublished: !!row.is_published,
    visibility: row.visibility as StoredPage["visibility"],
    hiddenFromDiscovery: !!row.hidden_from_discovery,
    updatedAt: row.updated_at,
  };
}

const MAX_VERSIONS_KEPT = 50;

/**
 * Validates and saves a page document as the user's current draft/live
 * page, and snapshots the previous version into page_document_versions
 * (never overwritten, never silently discarded) so Studio's "restore a
 * version" always has something real to restore.
 */
export function savePageDocument(userId: string, input: unknown): PageDocument {
  const document = parsePageDocument(input);
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT document_json FROM page_documents WHERE user_id = ?")
    .get(userId) as { document_json: string } | undefined;

  if (existing) {
    db.prepare(
      "INSERT INTO page_document_versions (id, user_id, document_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(randomUUID(), userId, existing.document_json, now);

    db.prepare(
      "UPDATE page_documents SET document_json = ?, updated_at = ? WHERE user_id = ?",
    ).run(JSON.stringify(document), now, userId);
  } else {
    db.prepare(
      `INSERT INTO page_documents (user_id, document_json, is_published, visibility, updated_at)
       VALUES (?, ?, 0, 'private', ?)`,
    ).run(userId, JSON.stringify(document), now);
  }

  // Prune old versions beyond the cap so history can't grow unbounded.
  db.prepare(
    `DELETE FROM page_document_versions
     WHERE user_id = ? AND id NOT IN (
       SELECT id FROM page_document_versions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
     )`,
  ).run(userId, userId, MAX_VERSIONS_KEPT);

  return document;
}

export function listVersions(userId: string): { id: string; createdAt: string }[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, created_at FROM page_document_versions WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as { id: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at }));
}

export class VersionNotFoundError extends Error {}

/** Restores a prior version as the current document, snapshotting the current one first (so restoring is itself reversible). */
export function restoreVersion(userId: string, versionId: string): PageDocument {
  const db = getDb();
  const versionRow = db
    .prepare("SELECT document_json FROM page_document_versions WHERE id = ? AND user_id = ?")
    .get(versionId, userId) as { document_json: string } | undefined;
  if (!versionRow) throw new VersionNotFoundError(`No such version: ${versionId}`);

  return savePageDocument(userId, JSON.parse(versionRow.document_json));
}

export function setPublished(userId: string, published: boolean): void {
  const db = getDb();
  const existing = db.prepare("SELECT user_id FROM page_documents WHERE user_id = ?").get(userId);
  if (!existing) {
    throw new Error("Cannot publish before a page document exists — save one first.");
  }
  db.prepare("UPDATE page_documents SET is_published = ?, updated_at = ? WHERE user_id = ?").run(
    published ? 1 : 0,
    new Date().toISOString(),
    userId,
  );
}

export function setVisibility(userId: string, visibility: StoredPage["visibility"]): void {
  const db = getDb();
  db.prepare("UPDATE page_documents SET visibility = ?, updated_at = ? WHERE user_id = ?").run(
    visibility,
    new Date().toISOString(),
    userId,
  );
}
