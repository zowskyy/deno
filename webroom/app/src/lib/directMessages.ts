import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hasBlockRelationship } from "./friends";
import { checkRateLimit, rateLimitActorKey } from "./rateLimit";

/** Error thrown when a direct message cannot be sent. */
export class DirectMessageError extends Error {}

/** A direct message between two users. */
export interface DirectMessage {
  id: string;
  senderId: string;
  senderHandle: string;
  recipientId: string;
  recipientHandle: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

/** Send a direct message after block and rate-limit checks. */
export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  body: string,
): Promise<DirectMessage> {
  const trimmed = body.trim();
  if (!trimmed) throw new DirectMessageError("Message cannot be empty.");
  if (trimmed.length > 2000) throw new DirectMessageError("Message must be under 2,000 characters.");
  if (senderId === recipientId) throw new DirectMessageError("You cannot message yourself.");

  if (hasBlockRelationship(senderId, recipientId)) {
    throw new DirectMessageError("You cannot message this user.");
  }

  const key = await rateLimitActorKey("dm:send", senderId);
  checkRateLimit(key, 30);

  const db = getDb();
  const recipient = db.prepare("SELECT id FROM users WHERE id = ?").get(recipientId);
  if (!recipient) throw new DirectMessageError("Recipient not found.");

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO direct_messages (id, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, senderId, recipientId, trimmed, now);

  const [msg] = listDirectMessagesForUser(senderId, { withUserId: recipientId, limit: 1 });
  return msg!;
}

/** List messages for a user, optionally filtered to one conversation. */
export function listDirectMessagesForUser(
  userId: string,
  options?: { withUserId?: string; cursor?: string; limit?: number },
): DirectMessage[] {
  const db = getDb();
  const limit = Math.min(options?.limit ?? 50, 50);

  let sql = `
    SELECT dm.id, dm.sender_id, dm.recipient_id, dm.body, dm.created_at, dm.read_at,
           s.handle as sender_handle, r.handle as recipient_handle
    FROM direct_messages dm
    JOIN users s ON s.id = dm.sender_id
    JOIN users r ON r.id = dm.recipient_id
    WHERE (dm.sender_id = ? OR dm.recipient_id = ?)`;
  const params: (string | number)[] = [userId, userId];

  if (options?.withUserId) {
    sql += ` AND ((dm.sender_id = ? AND dm.recipient_id = ?) OR (dm.sender_id = ? AND dm.recipient_id = ?))`;
    params.push(userId, options.withUserId, options.withUserId, userId);
  }
  if (options?.cursor) {
    sql += ` AND dm.created_at < ?`;
    params.push(options.cursor);
  }
  sql += ` ORDER BY dm.created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as {
    id: string;
    sender_id: string;
    recipient_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
    sender_handle: string;
    recipient_handle: string;
  }[];

  return rows.map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    senderHandle: row.sender_handle,
    recipientId: row.recipient_id,
    recipientHandle: row.recipient_handle,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

/** Conversation summaries for the inbox. */
export function listConversations(userId: string): {
  otherUserId: string;
  otherHandle: string;
  lastMessage: string;
  lastAt: string;
  unread: boolean;
}[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         CASE WHEN dm.sender_id = ? THEN dm.recipient_id ELSE dm.sender_id END as other_id,
         CASE WHEN dm.sender_id = ? THEN r.handle ELSE s.handle END as other_handle,
         dm.body, dm.created_at, dm.read_at, dm.recipient_id
       FROM direct_messages dm
       JOIN users s ON s.id = dm.sender_id
       JOIN users r ON r.id = dm.recipient_id
       WHERE dm.sender_id = ? OR dm.recipient_id = ?
       ORDER BY dm.created_at DESC`,
    )
    .all(userId, userId, userId, userId) as {
    other_id: string;
    other_handle: string;
    body: string;
    created_at: string;
    read_at: string | null;
    recipient_id: string;
  }[];

  const seen = new Set<string>();
  const out: ReturnType<typeof listConversations> = [];
  for (const row of rows) {
    if (seen.has(row.other_id)) continue;
    seen.add(row.other_id);
    out.push({
      otherUserId: row.other_id,
      otherHandle: row.other_handle,
      lastMessage: row.body,
      lastAt: row.created_at,
      unread: row.recipient_id === userId && !row.read_at,
    });
  }
  return out;
}

/** Mark messages from a sender as read for the recipient. */
export function markConversationRead(recipientId: string, senderId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE direct_messages SET read_at = ?
     WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL`,
  ).run(now, recipientId, senderId);
}
