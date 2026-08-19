import { z } from "zod";
import { getDb } from "./db";
import { randomUUID } from "node:crypto";
import {
  CURRENT_SCHEMA_VERSION,
  PageDocumentSchema,
  defaultPageDocumentFieldsV3,
  type PageDocument,
  type StoredPage,
} from "./pageDocumentTypes";

export {
  CURRENT_SCHEMA_VERSION,
  PageDocumentSchema,
  PAGE_PART_IDS,
  type PageDocument,
  type PagePartId,
  type StoredPage,
  type TemplateId,
  type Shrine,
  type PlaylistTrack,
  type PixelArtPiece,
  type MiniPage,
} from "./pageDocumentTypes";

export function defaultPageDocument(displayName: string): PageDocument {
  return {
    version: CURRENT_SCHEMA_VERSION,
    identity: { displayName, bio: "" },
    theme: {
      template: "start-simple",
      accent: "#e0526b",
      background: "#f1ede9",
      density: "comfortable",
      fontStyle: "sans",
      reduceMotion: false,
      customCss: "",
      customCssEnabled: false,
      attribution: undefined,
    },
    pageParts: ["identity", "links", "now"],
    links: [],
    now: "",
    ...defaultPageDocumentFieldsV3(),
  };
}

export function migrateDocument(input: Record<string, unknown>): PageDocument {
  if (input.version === CURRENT_SCHEMA_VERSION) return parsePageDocument(input);

  if (input.version === 2) {
    const theme = input.theme as Record<string, unknown> | undefined;
    return parsePageDocument({
      ...input,
      version: CURRENT_SCHEMA_VERSION,
      theme: {
        ...theme,
        customCss: "",
        customCssEnabled: false,
        attribution: undefined,
      },
      shrines: [],
      playlist: [],
      pixelArt: [],
      miniPages: [],
    });
  }

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
        customCss: "",
        customCssEnabled: false,
        attribution: undefined,
      },
      ...defaultPageDocumentFieldsV3(),
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
  const document =
    raw.version === CURRENT_SCHEMA_VERSION ? parsePageDocument(raw) : migrateDocument(raw);
  let draftDocument: PageDocument | null = null;
  if (row.draft_document_json) {
    const draftRaw = JSON.parse(row.draft_document_json) as Record<string, unknown>;
    draftDocument =
      draftRaw.version === CURRENT_SCHEMA_VERSION ? parsePageDocument(draftRaw) : migrateDocument(draftRaw);
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

/** Whether a viewer may access a page (profile, blog, mini-pages, guestbook). */
export function canViewPage(
  stored: StoredPage | null,
  ownerId: string,
  viewerId: string | null,
): boolean {
  if (!stored) return false;
  const isOwner = viewerId === ownerId;
  if (!stored.isPublished && !isOwner) return false;
  if (stored.visibility === "private" && !isOwner) return false;
  return true;
}

export function getEffectiveDocument(stored: StoredPage, isOwner: boolean, safePreview: boolean): PageDocument {
  if (isOwner && safePreview && stored.draftDocument) return stored.draftDocument;
  return stored.document;
}

export function getMiniPage(document: PageDocument, slug: string) {
  return document.miniPages.find((p) => p.slug === slug) ?? null;
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

export function activatePanicMode(userId: string): void {
  setHiddenFromDiscovery(userId, true);
  setVisibility(userId, "unlisted");
}

export function exportPageData(userId: string): string {
  const stored = getPageDocument(userId);
  if (!stored) throw new Error("No page to export.");
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      document: stored.document,
      isPublished: stored.isPublished,
      visibility: stored.visibility,
      hiddenFromDiscovery: stored.hiddenFromDiscovery,
    },
    null,
    2,
  );
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
