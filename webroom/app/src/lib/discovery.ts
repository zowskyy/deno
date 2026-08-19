import { getDb } from "./db";

// Minimal Phase 1 discovery: recently-published public pages only. Tags,
// web rings, random, and friend-graph browsing are Phase 4 — this
// exists now just so "Explore" isn't a dead link while a first page
// gets made, not as an attempt to deliver Phase 4 early.

export interface DiscoverablePage {
  handle: string;
  displayName: string;
  updatedAt: string;
}

export function listRecentlyPublished(limit = 24): DiscoverablePage[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.handle, pd.document_json, pd.updated_at
       FROM page_documents pd
       JOIN users u ON u.id = pd.user_id
       WHERE pd.is_published = 1 AND pd.visibility = 'public' AND pd.hidden_from_discovery = 0
         AND u.is_blocked_platform = 0
       ORDER BY pd.updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as { handle: string; document_json: string; updated_at: string }[];

  return rows.map((r) => {
    let displayName = r.handle;
    try {
      const doc = JSON.parse(r.document_json) as { identity?: { displayName?: string } };
      if (doc.identity?.displayName) displayName = doc.identity.displayName;
    } catch {
      // Malformed stored JSON should never crash discovery — fall back
      // to the handle, which is always valid.
    }
    return { handle: r.handle, displayName, updatedAt: r.updated_at };
  });
}
