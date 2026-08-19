import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hasBlockRelationship } from "./friends";
import { checkRateLimit, rateLimitActorKey, RateLimitError } from "./rateLimit";

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

  try {
    const key = await rateLimitActorKey("dm:send", senderId);
    checkRateLimit(key, 30);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new DirectMessageError(error.message);
    }
    throw error;
  }

  const db = getDb();
  const recipient = db.prepare("SELECT id FROM users WHERE id = ?").get(recipientId);
  if (!recipient) throw new DirectMessageError("Recipient not found.");

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO direct_messages (id, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, senderId, recipientId, trimmed, now);

  return getDirectMessageById(id);
}

/** Load a direct message by primary key. */
function getDirectMessageById(id: string): DirectMessage {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT dm.id, dm.sender_id, dm.recipient_id, dm.body, dm.created_at, dm.read_at,
              s.handle as sender_handle, r.handle as recipient_handle
       FROM direct_messages dm
       JOIN users s ON s.id = dm.sender_id
       JOIN users r ON r.id = dm.recipient_id
       WHERE dm.id = ?`,
    )
    .get(id) as
    | {
        id: string;
        sender_id: string;
        recipient_id: string;
        body: string;
        created_at: string;
        read_at: string | null;
        sender_handle: string;
        recipient_handle: string;
      }
    | undefined;
  if (!row) throw new DirectMessageError("Message not found.");
  return {
    id: row.id,
    senderId: row.sender_id,
    senderHandle: row.sender_handle,
    recipientId: row.recipient_id,
    recipientHandle: row.recipient_handle,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
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
    const [cursorAt, cursorId] = options.cursor.split("|");
    if (cursorAt && cursorId) {
      sql += ` AND (dm.created_at < ? OR (dm.created_at = ? AND dm.id < ?))`;
      params.push(cursorAt, cursorAt, cursorId);
    } else {
      sql += ` AND dm.created_at < ?`;
      params.push(options.cursor);
    }
  }
  sql += ` ORDER BY dm.created_at DESC, dm.id DESC LIMIT ?`;
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
      `WITH peers AS (
         SELECT
           CASE WHEN dm.sender_id = ? THEN dm.recipient_id ELSE dm.sender_id END AS other_id,
           dm.body,
           dm.created_at,
           dm.recipient_id,
           dm.read_at,
           ROW_NUMBER() OVER (
             PARTITION BY CASE WHEN dm.sender_id = ? THEN dm.recipient_id ELSE dm.sender_id END
             ORDER BY dm.created_at DESC, dm.id DESC
           ) AS rn
         FROM direct_messages dm
         WHERE dm.sender_id = ? OR dm.recipient_id = ?
       )
       SELECT p.other_id, u.handle AS other_handle, p.body, p.created_at, p.recipient_id, p.read_at,
              EXISTS (
                SELECT 1 FROM direct_messages unread
                WHERE unread.recipient_id = ?
                  AND unread.sender_id = p.other_id
                  AND unread.read_at IS NULL
              ) AS has_unread
       FROM peers p
       JOIN users u ON u.id = p.other_id
       WHERE p.rn = 1
       ORDER BY p.created_at DESC`,
    )
    .all(userId, userId, userId, userId, userId) as {
    other_id: string;
    other_handle: string;
    body: string;
    created_at: string;
    recipient_id: string;
    read_at: string | null;
    has_unread: number;
  }[];

  return rows.map((row) => ({
    otherUserId: row.other_id,
    otherHandle: row.other_handle,
    lastMessage: row.body,
    lastAt: row.created_at,
    unread: row.has_unread === 1,
  }));
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
