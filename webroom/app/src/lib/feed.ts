import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { listFriends } from "./friends";
import { parseDocMeta } from "./discovery";

/** Activity feed item for the home feed. */
export interface FeedItem {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  eventType: "page_published" | "page_updated" | "theme_shared";
  summary: string;
  createdAt: string;
}

/** Record a feed event when a user publishes or updates a public page. */
export function recordFeedEvent(
  userId: string,
  eventType: FeedItem["eventType"],
  payload: Record<string, unknown>,
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO feed_events (id, user_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), userId, eventType, JSON.stringify(payload), new Date().toISOString());
}

/** Paginated activity feed — friends first, then public updates. No view tracking. */
export function listFeedItems(
  viewerId: string | null,
  options?: { cursor?: string; limit?: number },
): FeedItem[] {
  const db = getDb();
  const limit = Math.min(options?.limit ?? 30, 50);

  let friendIds: string[] = [];
  if (viewerId) {
    friendIds = listFriends(viewerId).map((f) => f.userId);
  }

  let sql = `
    SELECT fe.id, fe.user_id, fe.event_type, fe.payload_json, fe.created_at, u.handle, pd.document_json
    FROM feed_events fe
    JOIN users u ON u.id = fe.user_id
    JOIN page_documents pd ON pd.user_id = fe.user_id
    WHERE pd.is_published = 1 AND pd.visibility IN ('public', 'unlisted')
      AND u.is_blocked_platform = 0 AND pd.hidden_from_discovery = 0`;
  const params: (string | number)[] = [];

  if (options?.cursor) {
    sql += ` AND fe.created_at < ?`;
    params.push(options.cursor);
  }
  sql += ` ORDER BY fe.created_at DESC LIMIT ?`;
  params.push(limit * 3);

  const rows = db.prepare(sql).all(...params) as {
    id: string;
    user_id: string;
    event_type: string;
    payload_json: string;
    created_at: string;
    handle: string;
    document_json: string;
  }[];

  const items: FeedItem[] = [];
  for (const row of rows) {
    const meta = parseDocMeta(row.document_json);
    items.push({
      id: row.id,
      userId: row.user_id,
      handle: row.handle,
      displayName: meta.displayName || row.handle,
      eventType: row.event_type as FeedItem["eventType"],
      summary: summarizeEvent(row.event_type, meta.displayName),
      createdAt: row.created_at,
    });
    if (items.length >= limit) break;
  }

  if (friendIds.length > 0) {
    items.sort((a, b) => {
      const aFriend = friendIds.includes(a.userId) ? 1 : 0;
      const bFriend = friendIds.includes(b.userId) ? 1 : 0;
      if (aFriend !== bFriend) return bFriend - aFriend;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  return items;
}

/** Build a short human-readable feed summary. */
function summarizeEvent(eventType: string, displayName: string): string {
  switch (eventType) {
    case "page_published":
      return `${displayName} published their page`;
    case "page_updated":
      return `${displayName} redecorated their page`;
    case "theme_shared":
      return `${displayName} shared a new theme`;
    default:
      return `${displayName} updated their corner`;
  }
}
