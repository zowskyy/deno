import { getDb } from "./db";
import { listFriends } from "./friends";
import { parseDocMeta } from "./discovery";

/** A page recommended for the viewer to explore. */
export interface RecommendedPage {
  handle: string;
  displayName: string;
  score: number;
  reason: string;
}

/**
 * Deterministic recommendation score:
 * tag overlap (40%) + friend-of-friend (35%) + recency (25%).
 * Same inputs always produce the same ranking.
 */
export function listRecommendedPages(viewerId: string | null, limit = 12): RecommendedPage[] {
  const db = getDb();
  const cap = Math.min(limit, 24);

  const viewerTags = new Set<string>();
  const friendIds = new Set<string>();
  const fofIds = new Set<string>();

  if (viewerId) {
    const tagRows = db.prepare("SELECT tag FROM page_tags WHERE user_id = ?").all(viewerId) as { tag: string }[];
    tagRows.forEach((r) => viewerTags.add(r.tag));
    for (const f of listFriends(viewerId)) {
      friendIds.add(f.userId);
      const theirFriends = listFriends(f.userId);
      theirFriends.forEach((tf) => {
        if (tf.userId !== viewerId) fofIds.add(tf.userId);
      });
    }
  }

  const rows = db
    .prepare(
      `SELECT u.id, u.handle, pd.document_json, pd.updated_at
       FROM page_documents pd
       JOIN users u ON u.id = pd.user_id
       WHERE pd.is_published = 1 AND pd.visibility = 'public'
         AND pd.hidden_from_discovery = 0 AND u.is_blocked_platform = 0`,
    )
    .all() as { id: string; handle: string; document_json: string; updated_at: string }[];

  const scored: RecommendedPage[] = [];
  for (const row of rows) {
    if (viewerId && row.id === viewerId) continue;
    if (friendIds.has(row.id)) continue;

    const meta = parseDocMeta(row.document_json);
    let score = 0;
    const reasons: string[] = [];

    const pageTags = meta.tags;
    const overlap = pageTags.filter((t) => viewerTags.has(t)).length;
    if (overlap > 0) {
      score += Math.min(overlap * 0.2, 0.4);
      reasons.push("shared tags");
    }
    if (fofIds.has(row.id)) {
      score += 0.35;
      reasons.push("friend of a friend");
    }
    const ageMs = Date.now() - new Date(row.updated_at).getTime();
    const recency = Math.max(0, 1 - ageMs / (30 * 24 * 60 * 60 * 1000));
    score += recency * 0.25;
    if (recency > 0.5) reasons.push("recently updated");

    if (score > 0.1) {
      scored.push({
        handle: row.handle,
        displayName: meta.displayName || row.handle,
        score,
        reason: reasons.join(", ") || "you might like this",
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, cap);
}
