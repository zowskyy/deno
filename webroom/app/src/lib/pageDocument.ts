import { z } from "zod";
import { getDb } from "./db";
import { randomUUID } from "node:crypto";

export const CURRENT_SCHEMA_VERSION = 2;

const TEMPLATE_IDS = ["soft-web", "pixel-tavern", "chrome-angel", "dark-zine", "clean-portfolio", "start-simple"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const PAGE_PART_IDS = [
  "identity", "friends", "links", "now", "gallery", "blog",
  "devlog", "guestbook", "topEight", "badges",
] as const;
export type PagePartId = (typeof PAGE_PART_IDS)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color");
const httpUrl = z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
  message: "must be http:// or https://",
});
const tagSlug = z.string().trim().min(1).max(30).regex(/^[a-z0-9][a-z0-9-]*$/, "tags must be lowercase letters, numbers, and hyphens");

const ThemeSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  accent: hexColor,
  background: hexColor,
  density: z.enum(["cozy", "comfortable", "spacious"]).default("comfortable"),
  fontStyle: z.enum(["serif", "sans", "mono"]).default("sans"),
  reduceMotion: z.boolean().default(false),
});

const LinkItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: httpUrl,
});

const IdentitySchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(280),
  status: z.string().trim().max(80).optional(),
  avatarAssetId: z.string().uuid().optional(),
});

const GalleryItemSchema = z.object({
  id: z.string().uuid(),
  url: httpUrl,
  alt: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(280).optional(),
});

const BlogPostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  body: z.string().trim().min(1).max(50000),
  publishedAt: z.string(),
});

const DevlogEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  body: z.string().trim().min(1).max(500),
});

const BadgeSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  emoji: z.string().max(8).optional(),
});

const AccessSchema = z.object({
  altTextReminder: z.boolean().default(true),
  contrastWarningsEnabled: z.boolean().default(true),
});

export const PageDocumentSchema = z.object({
  version: z.literal(CURRENT_SCHEMA_VERSION),
  identity: IdentitySchema,
  theme: ThemeSchema,
  pageParts: z.array(z.enum(PAGE_PART_IDS)).max(PAGE_PART_IDS.length),
  links: z.array(LinkItemSchema).max(30).default([]),
  now: z.string().trim().max(280).default(""),
  gallery: z.array(GalleryItemSchema).max(12).default([]),
  blog: z.array(BlogPostSchema).max(50).default([]),
  devlog: z.array(DevlogEntrySchema).max(100).default([]),
  badges: z.array(BadgeSchema).max(20).default([]),
  topEight: z.array(z.string().trim().min(1).max(32)).max(8).default([]),
  tags: z.array(tagSlug).max(10).default([]),
  guestbook: z.object({
    enabled: z.boolean().default(true),
    requireApproval: z.boolean().default(true),
  }).default({ enabled: true, requireApproval: true }),
  access: AccessSchema.default({ altTextReminder: true, contrastWarningsEnabled: true }),
});

export type PageDocument = z.infer<typeof PageDocumentSchema>;

export function defaultPageDocument(displayName: string): PageDocument {
  return {
    version: CURRENT_SCHEMA_VERSION,
    identity: { displayName, bio: "" },
    theme: { template: "start-simple", accent: "#e0526b", background: "#f1ede9", density: "comfortable", fontStyle: "sans", reduceMotion: false },
    pageParts: ["identity", "links", "now"],
    links: [],
    now: "",
    gallery: [],
    blog: [],
    devlog: [],
    badges: [],
    topEight: [],
    tags: [],
    guestbook: { enabled: true, requireApproval: true },
    access: { altTextReminder: true, contrastWarningsEnabled: true },
  };
}

/** Upgrades a v1 document shape to v2 without losing data. */
export function migrateDocument(input: Record<string, unknown>): PageDocument {
  if (input.version === 1) {
    const theme = input.theme as Record<string, unknown> | undefined;
    return parsePageDocument({
      ...input,
      version: CURRENT_SCHEMA_VERSION,
      theme: {
        template: theme?.template ?? "start-simple",
        accent: theme?.accent ?? "#e0526b",
        background: theme?.background ?? "#f1ede9",
        density: theme?.density ?? "comfortable",
        fontStyle: "sans",
        reduceMotion: false,
      },
      gallery: [],
      blog: [],
      devlog: [],
      badges: [],
      topEight: [],
      tags: [],
      guestbook: { enabled: true, requireApproval: true },
      access: { altTextReminder: true, contrastWarningsEnabled: true },
    });
  }
  return parsePageDocument(input);
}

export class PageDocumentValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`Page document is invalid: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

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
  draftDocument: PageDocument | null;
  isPublished: boolean;
  visibility: "private" | "unlisted" | "public";
  hiddenFromDiscovery: boolean;
  guestbookDisabled: boolean;
  updatedAt: string;
}

function rowToStored(row: {
  document_json: string;
  draft_document_json: string | null;
  is_published: number;
  visibility: string;
  hidden_from_discovery: number;
  guestbook_disabled: number;
  updated_at: string;
}): StoredPage {
  const raw = JSON.parse(row.document_json) as Record<string, unknown>;
  const document = raw.version === CURRENT_SCHEMA_VERSION ? parsePageDocument(raw) : migrateDocument(raw);
  let draftDocument: PageDocument | null = null;
  if (row.draft_document_json) {
    const draftRaw = JSON.parse(row.draft_document_json) as Record<string, unknown>;
    draftDocument = draftRaw.version === CURRENT_SCHEMA_VERSION ? parsePageDocument(draftRaw) : migrateDocument(draftRaw);
  }
  return {
    document,
    draftDocument,
    isPublished: !!row.is_published,
    visibility: row.visibility as StoredPage["visibility"],
    hiddenFromDiscovery: !!row.hidden_from_discovery,
    guestbookDisabled: !!row.guestbook_disabled,
    updatedAt: row.updated_at,
  };
}

export function getPageDocument(userId: string): StoredPage | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT document_json, draft_document_json, is_published, visibility, hidden_from_discovery,
              guestbook_disabled, updated_at
       FROM page_documents WHERE user_id = ?`,
    )
    .get(userId) as Parameters<typeof rowToStored>[0] | undefined;
  if (!row) return null;
  return rowToStored(row);
}

const MAX_VERSIONS_KEPT = 50;

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

    db.prepare("UPDATE page_documents SET document_json = ?, updated_at = ? WHERE user_id = ?").run(
      JSON.stringify(document),
      now,
      userId,
    );
  } else {
    db.prepare(
      `INSERT INTO page_documents (user_id, document_json, is_published, visibility, updated_at)
       VALUES (?, ?, 0, 'private', ?)`,
    ).run(userId, JSON.stringify(document), now);
  }

  syncPageTags(userId, document.tags);

  db.prepare(
    `DELETE FROM page_document_versions
     WHERE user_id = ? AND id NOT IN (
       SELECT id FROM page_document_versions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
     )`,
  ).run(userId, userId, MAX_VERSIONS_KEPT);

  return document;
}

export function saveDraftDocument(userId: string, input: unknown): PageDocument {
  const document = parsePageDocument(input);
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT user_id FROM page_documents WHERE user_id = ?").get(userId);
  if (!existing) throw new Error("Cannot save a draft before a page document exists.");
  db.prepare("UPDATE page_documents SET draft_document_json = ?, updated_at = ? WHERE user_id = ?").run(
    JSON.stringify(document),
    now,
    userId,
  );
  return document;
}

export function publishDraft(userId: string): PageDocument {
  const db = getDb();
  const row = db
    .prepare("SELECT draft_document_json, document_json FROM page_documents WHERE user_id = ?")
    .get(userId) as { draft_document_json: string | null; document_json: string } | undefined;
  if (!row?.draft_document_json) throw new Error("No draft to publish.");
  return savePageDocument(userId, JSON.parse(row.draft_document_json));
}

export function discardDraft(userId: string): void {
  const db = getDb();
  db.prepare("UPDATE page_documents SET draft_document_json = NULL WHERE user_id = ?").run(userId);
}

export function getEffectiveDocument(stored: StoredPage, isOwner: boolean, safePreview: boolean): PageDocument {
  if (isOwner && safePreview && stored.draftDocument) return stored.draftDocument;
  return stored.document;
}

function syncPageTags(userId: string, tags: string[]): void {
  const db = getDb();
  db.prepare("DELETE FROM page_tags WHERE user_id = ?").run(userId);
  const insert = db.prepare("INSERT INTO page_tags (user_id, tag) VALUES (?, ?)");
  for (const tag of tags) {
    insert.run(userId, tag.toLowerCase());
  }
}

export function listVersions(userId: string): { id: string; createdAt: string }[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, created_at FROM page_document_versions WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as { id: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at }));
}

export class VersionNotFoundError extends Error {}

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
  if (!existing) throw new Error("Cannot publish before a page document exists — save one first.");
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

export function setHiddenFromDiscovery(userId: string, hidden: boolean): void {
  const db = getDb();
  db.prepare("UPDATE page_documents SET hidden_from_discovery = ?, updated_at = ? WHERE user_id = ?").run(
    hidden ? 1 : 0,
    new Date().toISOString(),
    userId,
  );
}

export function setGuestbookDisabled(userId: string, disabled: boolean): void {
  const db = getDb();
  db.prepare("UPDATE page_documents SET guestbook_disabled = ?, updated_at = ? WHERE user_id = ?").run(
    disabled ? 1 : 0,
    new Date().toISOString(),
    userId,
  );
}

export function exportPageData(userId: string): string {
  const stored = getPageDocument(userId);
  if (!stored) throw new Error("No page to export.");
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    document: stored.document,
    isPublished: stored.isPublished,
    visibility: stored.visibility,
    hiddenFromDiscovery: stored.hiddenFromDiscovery,
  }, null, 2);
}

export function importPageData(userId: string, json: string): PageDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PageDocumentValidationError(["import file is not valid JSON"]);
  }
  const obj = parsed as { document?: unknown };
  if (!obj.document) throw new PageDocumentValidationError(["import file must contain a document field"]);
  return savePageDocument(userId, obj.document);
}

export const TEMPLATE_PRESETS: Record<TemplateId, { accent: string; background: string; fontStyle: PageDocument["theme"]["fontStyle"] }> = {
  "soft-web": { accent: "#e0526b", background: "#f6ecec", fontStyle: "serif" },
  "pixel-tavern": { accent: "#c7314b", background: "#241b2e", fontStyle: "mono" },
  "chrome-angel": { accent: "#ff4db8", background: "#160a23", fontStyle: "sans" },
  "dark-zine": { accent: "#f1eaee", background: "#0e0e0e", fontStyle: "serif" },
  "clean-portfolio": { accent: "#2563eb", background: "#ffffff", fontStyle: "sans" },
  "start-simple": { accent: "#e0526b", background: "#f1ede9", fontStyle: "sans" },
};

export function contrastRatio(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const l1 = lum(foreground);
  const l2 = lum(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getContrastWarnings(document: PageDocument): string[] {
  if (!document.access.contrastWarningsEnabled) return [];
  const warnings: string[] = [];
  const ratio = contrastRatio(document.theme.accent, document.theme.background);
  if (ratio < 4.5) {
    warnings.push(`Accent and background contrast is ${ratio.toFixed(1)}:1 — aim for at least 4.5:1 for readable links and headings.`);
  }
  for (const item of document.gallery) {
    if (!item.alt.trim()) warnings.push(`Gallery image "${item.url}" is missing alt text.`);
  }
  return warnings;
}
