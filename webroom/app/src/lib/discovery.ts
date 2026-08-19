import { getDb } from "./db";

export interface DiscoverablePage {
  handle: string;
  displayName: string;
  updatedAt: string;
  tags: string[];
  template: string;
}

function parseDocMeta(documentJson: string): { displayName: string; tags: string[]; template: string } {
  try {
    const doc = JSON.parse(documentJson) as {
      identity?: { displayName?: string };
      tags?: string[];
      theme?: { template?: string };
    };
    return {
      displayName: doc.identity?.displayName ?? "",
      tags: doc.tags ?? [],
      template: doc.theme?.template ?? "start-simple",
    };
  } catch {
    return { displayName: "", tags: [], template: "start-simple" };
  }
}

const DISCOVERABLE_WHERE = `
  pd.is_published = 1 AND pd.visibility = 'public' AND pd.hidden_from_discovery = 0
  AND u.is_blocked_platform = 0
`;

export function listRecentlyPublished(limit = 24): DiscoverablePage[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.handle, pd.document_json, pd.updated_at
       FROM page_documents pd
       JOIN users u ON u.id = pd.user_id
       WHERE ${DISCOVERABLE_WHERE}
       ORDER BY pd.updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as { handle: string; document_json: string; updated_at: string }[];

  return rows.map((r) => {
    const meta = parseDocMeta(r.document_json);
    return {
      handle: r.handle,
      displayName: meta.displayName || r.handle,
      updatedAt: r.updated_at,
      tags: meta.tags,
      template: meta.template,
    };
  });
}

export function listByTag(tag: string, limit = 24): DiscoverablePage[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.handle, pd.document_json, pd.updated_at
       FROM page_tags pt
       JOIN users u ON u.id = pt.user_id
       JOIN page_documents pd ON pd.user_id = pt.user_id
       WHERE pt.tag = ? AND ${DISCOVERABLE_WHERE}
       ORDER BY pd.updated_at DESC
       LIMIT ?`,
    )
    .all(tag.toLowerCase(), limit) as { handle: string; document_json: string; updated_at: string }[];

  return rows.map((r) => {
    const meta = parseDocMeta(r.document_json);
    return { handle: r.handle, displayName: meta.displayName || r.handle, updatedAt: r.updated_at, tags: meta.tags, template: meta.template };
  });
}

export function listByTemplate(template: string, limit = 24): DiscoverablePage[] {
  const pages = listRecentlyPublished(200);
  return pages.filter((p) => p.template === template).slice(0, limit);
}

export function getRandomPage(): DiscoverablePage | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.handle, pd.document_json, pd.updated_at
       FROM page_documents pd
       JOIN users u ON u.id = pd.user_id
       WHERE ${DISCOVERABLE_WHERE}
       ORDER BY RANDOM()
       LIMIT 1`,
    )
    .get() as { handle: string; document_json: string; updated_at: string } | undefined;
  if (!row) return null;
  const meta = parseDocMeta(row.document_json);
  return { handle: row.handle, displayName: meta.displayName || row.handle, updatedAt: row.updated_at, tags: meta.tags, template: meta.template };
}

export function listPopularTags(limit = 20): { tag: string; count: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT pt.tag, COUNT(*) as count
       FROM page_tags pt
       JOIN page_documents pd ON pd.user_id = pt.user_id
       JOIN users u ON u.id = pt.user_id
       WHERE ${DISCOVERABLE_WHERE}
       GROUP BY pt.tag
       ORDER BY count DESC, pt.tag ASC
       LIMIT ?`,
    )
    .all(limit) as { tag: string; count: number }[];
  return rows;
}

export function searchPages(query: string, limit = 24): DiscoverablePage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.handle, pd.document_json, pd.updated_at
       FROM page_documents pd
       JOIN users u ON u.id = pd.user_id
       WHERE ${DISCOVERABLE_WHERE}
         AND (LOWER(u.handle) LIKE ? OR LOWER(pd.document_json) LIKE ?)
       ORDER BY pd.updated_at DESC
       LIMIT ?`,
    )
    .all(`%${q}%`, `%${q}%`, limit) as { handle: string; document_json: string; updated_at: string }[];

  return rows.map((r) => {
    const meta = parseDocMeta(r.document_json);
    return { handle: r.handle, displayName: meta.displayName || r.handle, updatedAt: r.updated_at, tags: meta.tags, template: meta.template };
  });
}
