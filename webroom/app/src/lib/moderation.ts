import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { listOpenReports, type ReportSummary } from "./reports";

export type { ReportSummary };

export { listOpenReports };

/** Promote a configured or first user to moderator when none exists. */
export function ensureModeratorSeed(): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE is_moderator = 1 LIMIT 1").get();
  if (existing) return;

  const configuredHandle = process.env.WEBROOM_MODERATOR_HANDLE?.trim().toLowerCase();
  if (configuredHandle) {
    const user = db
      .prepare("SELECT id FROM users WHERE handle_lower = ?")
      .get(configuredHandle) as { id: string } | undefined;
    if (user) {
      db.prepare("UPDATE users SET is_moderator = 1 WHERE id = ?").run(user.id);
    }
    return;
  }

  if (process.env.WEBROOM_AUTO_MODERATOR_SEED !== "true") return;

  const first = db.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
  if (!first) return;
  db.prepare("UPDATE users SET is_moderator = 1 WHERE id = ?").run(first.id);
}

/** Mark a user report reviewed or dismissed and log the moderator action. */
export function reviewReport(
  reportId: string,
  moderatorId: string,
  status: "reviewed" | "dismissed",
  note: string,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      "UPDATE reports SET status = ?, moderator_id = ?, moderator_note = ?, reviewed_at = ? WHERE id = ? AND status = 'open'",
    )
    .run(status, moderatorId, note.trim() || null, now, reportId);
  if (result.changes === 0) return false;

  const report = db.prepare("SELECT reported_handle FROM reports WHERE id = ?").get(reportId) as
    | { reported_handle: string }
    | undefined;
  logModeratorAction(moderatorId, `report_${status}`, report?.reported_handle ?? null, note);
  return true;
}

/** Append an auditable moderator action to the log. */
export function logModeratorAction(
  moderatorId: string,
  action: string,
  targetHandle: string | null,
  detail: string,
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO moderator_logs (id, moderator_id, action, target_handle, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), moderatorId, action, targetHandle, detail, new Date().toISOString());
}

/** List recent moderator actions with handles and details. */
export function listModeratorLogs(limit = 50): {
  action: string;
  targetHandle: string | null;
  detail: string;
  createdAt: string;
  moderatorHandle: string;
}[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ml.action, ml.target_handle, ml.detail, ml.created_at, u.handle as moderator_handle
       FROM moderator_logs ml
       JOIN users u ON u.id = ml.moderator_id
       ORDER BY ml.created_at DESC
       LIMIT ?`,
    )
    .all(limit) as {
    action: string;
    target_handle: string | null;
    detail: string;
    created_at: string;
    moderator_handle: string;
  }[];

  return rows.map((r) => ({
    action: r.action,
    targetHandle: r.target_handle,
    detail: r.detail,
    createdAt: r.created_at,
    moderatorHandle: r.moderator_handle,
  }));
}

/** Return whether the user has moderator privileges. */
export function isModerator(userId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT is_moderator FROM users WHERE id = ?").get(userId) as
    | { is_moderator: number }
    | undefined;
  return !!row?.is_moderator;
}

/** User record returned by moderation lookup tools. */
export interface ModerationUserTarget {
  id: string;
  handle: string;
  isBlockedPlatform: boolean;
}

/** Look up a user by handle for moderation actions. */
export function findUserForModeration(rawHandle: string): ModerationUserTarget | null {
  const handle = rawHandle.trim().toLowerCase();
  const db = getDb();
  const row = db
    .prepare("SELECT id, handle, is_blocked_platform FROM users WHERE handle_lower = ?")
    .get(handle) as { id: string; handle: string; is_blocked_platform: number } | undefined;
  if (!row) return null;
  return { id: row.id, handle: row.handle, isBlockedPlatform: !!row.is_blocked_platform };
}

/** Block or unblock a user platform-wide and log the action. */
export function setPlatformBlock(userId: string, blocked: boolean, moderatorId: string): void {
  const db = getDb();
  db.prepare("UPDATE users SET is_blocked_platform = ? WHERE id = ?").run(blocked ? 1 : 0, userId);
  const user = db.prepare("SELECT handle FROM users WHERE id = ?").get(userId) as { handle: string } | undefined;
  logModeratorAction(moderatorId, blocked ? "platform_block" : "platform_unblock", user?.handle ?? null, "");
}
