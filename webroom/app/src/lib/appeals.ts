import { randomUUID } from "node:crypto";
import { getDb } from "./db";

/** Error thrown when an appeal action fails validation or preconditions. */
export class AppealError extends Error {}

/** Summary of a platform-block appeal for moderator review. */
export interface AppealSummary {
  id: string;
  userId: string;
  userHandle: string;
  appealType: "platform_block";
  reason: string;
  createdAt: string;
  status: "open" | "granted" | "dismissed";
}

/** Return true when a SQLite error indicates a unique-index violation. */
function isOpenAppealUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || error.message.includes("UNIQUE constraint failed");
}

/** Submit a platform-block appeal for the given user. */
export function fileAppeal(userId: string, reason: string): void {
  const trimmed = reason.trim();
  if (!trimmed) throw new AppealError("Tell us why you're appealing.");
  if (trimmed.length > 1000) throw new AppealError("Keep your appeal under 1,000 characters.");

  const db = getDb();
  const user = db
    .prepare("SELECT is_blocked_platform FROM users WHERE id = ?")
    .get(userId) as { is_blocked_platform: number } | undefined;
  if (!user) throw new AppealError("Account not found.");
  if (!user.is_blocked_platform) {
    throw new AppealError("Appeals are only for platform-blocked accounts.");
  }

  const existing = db
    .prepare("SELECT id FROM appeals WHERE user_id = ? AND status = 'open' LIMIT 1")
    .get(userId);
  if (existing) throw new AppealError("You already have an open appeal.");

  try {
    db.prepare(
      "INSERT INTO appeals (id, user_id, appeal_type, reason, created_at) VALUES (?, ?, 'platform_block', ?, ?)",
    ).run(randomUUID(), userId, trimmed, new Date().toISOString());
  } catch (error) {
    if (isOpenAppealUniqueViolation(error)) {
      throw new AppealError("You already have an open appeal.");
    }
    throw error;
  }
}

/** List open appeals awaiting moderator review. */
export function listOpenAppeals(limit = 50): AppealSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, a.user_id, u.handle as user_handle, a.appeal_type, a.reason, a.created_at, a.status
       FROM appeals a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'open'
       ORDER BY a.created_at ASC
       LIMIT ?`,
    )
    .all(limit) as {
    id: string;
    user_id: string;
    user_handle: string;
    appeal_type: string;
    reason: string;
    created_at: string;
    status: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userHandle: r.user_handle,
    appealType: r.appeal_type as AppealSummary["appealType"],
    reason: r.reason,
    createdAt: r.created_at,
    status: r.status as AppealSummary["status"],
  }));
}

/** Grant or dismiss an open appeal and unblock the user when granted. */
export function reviewAppeal(
  appealId: string,
  moderatorId: string,
  status: "granted" | "dismissed",
  note: string,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    const appeal = db
      .prepare("SELECT user_id FROM appeals WHERE id = ? AND status = 'open'")
      .get(appealId) as { user_id: string } | undefined;
    if (!appeal) {
      db.exec("ROLLBACK");
      return false;
    }

    const result = db
      .prepare(
        "UPDATE appeals SET status = ?, moderator_id = ?, moderator_note = ?, reviewed_at = ? WHERE id = ? AND status = 'open'",
      )
      .run(status, moderatorId, note.trim() || null, now, appealId);
    if (result.changes === 0) {
      db.exec("ROLLBACK");
      return false;
    }

    if (status === "granted") {
      db.prepare("UPDATE users SET is_blocked_platform = 0 WHERE id = ?").run(appeal.user_id);
    }

    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
