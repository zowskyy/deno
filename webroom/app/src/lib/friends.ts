import { randomUUID } from "node:crypto";
import { getDb } from "./db";

// Friends are a real, mutual-accept graph — the thing people actually
// browse through, per the Discovery section of the plan. A request is
// never a public relationship until the addressee accepts it, and a
// block always wins over a pending or future request in either
// direction.

export class FriendRequestError extends Error {}

function isBlocked(db: ReturnType<typeof getDb>, a: string, b: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
    )
    .get(a, b, b, a);
  return !!row;
}

/** True if either user has blocked the other, in either direction — used to hide a page from a blocked relationship regardless of who blocked whom. */
export function hasBlockRelationship(userIdA: string, userIdB: string): boolean {
  return isBlocked(getDb(), userIdA, userIdB);
}

export function sendFriendRequest(requesterId: string, addresseeId: string): void {
  if (requesterId === addresseeId) {
    throw new FriendRequestError("You can't send a friend request to yourself.");
  }
  const db = getDb();

  if (isBlocked(db, requesterId, addresseeId)) {
    // Deliberately vague: don't reveal whether the block is theirs or
    // ours, or that a block exists at all — just that this isn't
    // possible, same principle as not leaking account existence.
    throw new FriendRequestError("This friend request can't be sent.");
  }

  const existing = db
    .prepare(
      `SELECT id, status, requester_id FROM friend_links
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    )
    .get(requesterId, addresseeId, addresseeId, requesterId) as
    | { id: string; status: string; requester_id: string }
    | undefined;

  if (existing) {
    if (existing.status === "accepted") {
      throw new FriendRequestError("You're already friends.");
    }
    if (existing.requester_id === requesterId) {
      throw new FriendRequestError("You've already sent a friend request — it's waiting for them to respond.");
    }
    // They already requested us — accept it instead of creating a duplicate.
    acceptFriendRequest(requesterId, existing.id);
    return;
  }

  db.prepare(
    `INSERT INTO friend_links (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
  ).run(randomUUID(), requesterId, addresseeId, new Date().toISOString());
}

export class FriendLinkNotFoundError extends Error {}

export function acceptFriendRequest(currentUserId: string, requestId: string): void {
  const db = getDb();
  const row = db
    .prepare("SELECT id, addressee_id, status FROM friend_links WHERE id = ?")
    .get(requestId) as { id: string; addressee_id: string; status: string } | undefined;

  if (!row) throw new FriendLinkNotFoundError("No such friend request.");
  if (row.addressee_id !== currentUserId) {
    throw new FriendRequestError("Only the recipient can accept a friend request.");
  }
  if (row.status === "accepted") return; // idempotent

  db.prepare("UPDATE friend_links SET status = 'accepted', responded_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    requestId,
  );
}

/** Declining a pending request or unfriending an accepted one both just remove the link — either side can re-request later unless blocked. */
export function removeFriendLink(currentUserId: string, requestId: string): void {
  const db = getDb();
  const row = db
    .prepare("SELECT requester_id, addressee_id FROM friend_links WHERE id = ?")
    .get(requestId) as { requester_id: string; addressee_id: string } | undefined;
  if (!row) return;
  if (row.requester_id !== currentUserId && row.addressee_id !== currentUserId) {
    throw new FriendRequestError("You're not part of this friend link.");
  }
  db.prepare("DELETE FROM friend_links WHERE id = ?").run(requestId);
}

export interface FriendSummary {
  linkId: string;
  userId: string;
  handle: string;
}

/** Accepted friends only — the publicly browsable graph edge. */
export function listFriends(userId: string): FriendSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT fl.id as link_id, u.id as user_id, u.handle
       FROM friend_links fl
       JOIN users u ON u.id = CASE WHEN fl.requester_id = ? THEN fl.addressee_id ELSE fl.requester_id END
       WHERE (fl.requester_id = ? OR fl.addressee_id = ?) AND fl.status = 'accepted'
       ORDER BY fl.responded_at DESC`,
    )
    .all(userId, userId, userId) as { link_id: string; user_id: string; handle: string }[];
  return rows.map((r) => ({ linkId: r.link_id, userId: r.user_id, handle: r.handle }));
}

export interface PendingRequest {
  id: string;
  fromUserId: string;
  fromHandle: string;
  createdAt: string;
}

/** Requests this user has received and hasn't responded to yet. */
export function listIncomingRequests(userId: string): PendingRequest[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT fl.id, u.id as from_id, u.handle as from_handle, fl.created_at
       FROM friend_links fl JOIN users u ON u.id = fl.requester_id
       WHERE fl.addressee_id = ? AND fl.status = 'pending'
       ORDER BY fl.created_at DESC`,
    )
    .all(userId) as { id: string; from_id: string; from_handle: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, fromUserId: r.from_id, fromHandle: r.from_handle, createdAt: r.created_at }));
}

export function blockUser(blockerId: string, blockedId: string): void {
  if (blockerId === blockedId) throw new FriendRequestError("You can't block yourself.");
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)",
  ).run(blockerId, blockedId, new Date().toISOString());
  // Blocking always tears down any existing friend link between the two,
  // in either direction and any status — a block is a hard stop.
  db.prepare(
    `DELETE FROM friend_links
     WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
  ).run(blockerId, blockedId, blockedId, blockerId);
}

export function unblockUser(blockerId: string, blockedId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?").run(blockerId, blockedId);
}

export type FriendRelationship =
  | { status: "none" }
  | { status: "pending_sent"; requestId: string }
  | { status: "pending_received"; requestId: string }
  | { status: "accepted"; requestId: string };

export function getFriendRelationship(viewerId: string, otherUserId: string): FriendRelationship {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, status, requester_id FROM friend_links
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    )
    .get(viewerId, otherUserId, otherUserId, viewerId) as
    | { id: string; status: string; requester_id: string }
    | undefined;

  if (!row) return { status: "none" };
  if (row.status === "accepted") return { status: "accepted", requestId: row.id };
  if (row.requester_id === viewerId) return { status: "pending_sent", requestId: row.id };
  return { status: "pending_received", requestId: row.id };
}

export function listBlockedUsers(blockerId: string): { userId: string; handle: string }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.id as user_id, u.handle
       FROM blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = ?
       ORDER BY b.created_at DESC`,
    )
    .all(blockerId) as { user_id: string; handle: string }[];
  return rows.map((r) => ({ userId: r.user_id, handle: r.handle }));
}

/** Public friends of a user, respecting visibility — only shows friends with public published pages. */
export function listPublicFriends(userId: string, viewerId: string | null): FriendSummary[] {
  const friends = listFriends(userId);
  const db = getDb();
  return friends.filter((f) => {
    if (viewerId && hasBlockRelationship(viewerId, f.userId)) return false;
    const row = db
      .prepare(
        `SELECT visibility, is_published, hidden_from_discovery FROM page_documents WHERE user_id = ?`,
      )
      .get(f.userId) as { visibility: string; is_published: number; hidden_from_discovery: number } | undefined;
    if (!row || !row.is_published) return false;
    if (row.visibility === "private") return viewerId === f.userId;
    if (row.visibility === "unlisted") return viewerId === f.userId || viewerId === userId;
    return !row.hidden_from_discovery || viewerId === f.userId;
  });
}
