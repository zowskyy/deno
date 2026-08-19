import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "./db";
import { listBlockRelatedUserIds, listFriends } from "./friends";
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

/** Insert a feed event using an existing database connection (for transactions). */
export function insertFeedEvent(
  db: DatabaseSync,
  userId: string,
  eventType: FeedItem["eventType"],
  payload: Record<string, unknown>,
  createdAt: string,
): void {
  db.prepare(
    "INSERT INTO feed_events (id, user_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), userId, eventType, JSON.stringify(payload), createdAt);
}

/** Record a feed event when a user publishes or updates a public page. */
export function recordFeedEvent(
  userId: string,
  eventType: FeedItem["eventType"],
  payload: Record<string, unknown>,
): void {
  insertFeedEvent(getDb(), userId, eventType, payload, new Date().toISOString());
}

/** Paginated activity feed — friends first, then public updates. No view tracking. */
export function listFeedItems(
  viewerId: string | null,
  options?: { cursor?: string; limit?: number },
): FeedItem[] {
  const db = getDb();
  const limit = Math.min(options?.limit ?? 30, 50);

  const friendIds = viewerId ? listFriends(viewerId).map((f) => f.userId) : [];
  const blockedIds = viewerId ? listBlockRelatedUserIds(viewerId) : [];

  let sql = `
    SELECT fe.id, fe.user_id, fe.event_type, fe.payload_json, fe.created_at, u.handle, pd.document_json
    FROM feed_events fe
    JOIN users u ON u.id = fe.user_id
    JOIN page_documents pd ON pd.user_id = fe.user_id
    WHERE pd.is_published = 1 AND pd.visibility IN ('public', 'unlisted')
      AND u.is_blocked_platform = 0 AND pd.hidden_from_discovery = 0`;
  const params: (string | number)[] = [];

  if (blockedIds.length > 0) {
    sql += ` AND fe.user_id NOT IN (${blockedIds.map(() => "?").join(",")})`;
    params.push(...blockedIds);
  }

  if (options?.cursor) {
    sql += ` AND fe.created_at < ?`;
    params.push(options.cursor);
  }

  if (friendIds.length > 0) {
    sql += ` ORDER BY CASE WHEN fe.user_id IN (${friendIds.map(() => "?").join(",")}) THEN 0 ELSE 1 END, fe.created_at DESC LIMIT ?`;
    params.push(...friendIds, limit);
  } else {
    sql += ` ORDER BY fe.created_at DESC LIMIT ?`;
    params.push(limit);
  }

  const rows = db.prepare(sql).all(...params) as {
    id: string;
    user_id: string;
    event_type: string;
    payload_json: string;
    created_at: string;
    handle: string;
    document_json: string;
  }[];

  return rows.map((row) => {
    const meta = parseDocMeta(row.document_json);
    return {
      id: row.id,
      userId: row.user_id,
      handle: row.handle,
      displayName: meta.displayName || row.handle,
      eventType: row.event_type as FeedItem["eventType"],
      summary: summarizeEvent(row.event_type, meta.displayName),
      createdAt: row.created_at,
    };
  });
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
