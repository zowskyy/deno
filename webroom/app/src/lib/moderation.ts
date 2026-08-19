import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export interface ReportSummary {
  id: string;
  reportedHandle: string;
  reason: string;
  createdAt: string;
  status: "open" | "reviewed" | "dismissed";
  reporterHandle: string | null;
}

export function listOpenReports(limit = 50): ReportSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.id, r.reported_handle, r.reason, r.created_at, r.status, u.handle as reporter_handle
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       WHERE r.status = 'open'
       ORDER BY r.created_at ASC
       LIMIT ?`,
    )
    .all(limit) as { id: string; reported_handle: string; reason: string; created_at: string; status: string; reporter_handle: string | null }[];

  return rows.map((r) => ({
    id: r.id,
    reportedHandle: r.reported_handle,
    reason: r.reason,
    createdAt: r.created_at,
    status: r.status as ReportSummary["status"],
    reporterHandle: r.reporter_handle,
  }));
}

export function reviewReport(
  reportId: string,
  moderatorId: string,
  status: "reviewed" | "dismissed",
  note: string,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE reports SET status = ?, moderator_id = ?, moderator_note = ?, reviewed_at = ? WHERE id = ?",
  ).run(status, moderatorId, note.trim() || null, now, reportId);

  const report = db.prepare("SELECT reported_handle FROM reports WHERE id = ?").get(reportId) as { reported_handle: string } | undefined;
  logModeratorAction(moderatorId, `report_${status}`, report?.reported_handle ?? null, note);
}

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

export function listModeratorLogs(limit = 50): { action: string; targetHandle: string | null; detail: string; createdAt: string; moderatorHandle: string }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ml.action, ml.target_handle, ml.detail, ml.created_at, u.handle as moderator_handle
       FROM moderator_logs ml
       JOIN users u ON u.id = ml.moderator_id
       ORDER BY ml.created_at DESC
       LIMIT ?`,
    )
    .all(limit) as { action: string; target_handle: string | null; detail: string; created_at: string; moderator_handle: string }[];

  return rows.map((r) => ({
    action: r.action,
    targetHandle: r.target_handle,
    detail: r.detail,
    createdAt: r.created_at,
    moderatorHandle: r.moderator_handle,
  }));
}

export function isModerator(userId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT is_moderator FROM users WHERE id = ?").get(userId) as { is_moderator: number } | undefined;
  return !!row?.is_moderator;
}

export function setPlatformBlock(userId: string, blocked: boolean, moderatorId: string): void {
  const db = getDb();
  db.prepare("UPDATE users SET is_blocked_platform = ? WHERE id = ?").run(blocked ? 1 : 0, userId);
  const user = db.prepare("SELECT handle FROM users WHERE id = ?").get(userId) as { handle: string } | undefined;
  logModeratorAction(moderatorId, blocked ? "platform_block" : "platform_unblock", user?.handle ?? null, "");
}
