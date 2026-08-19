import { randomUUID } from "node:crypto";
import { getDb } from "./db";

const VALID_REASONS = ["harassment", "impersonation", "unsafe-content", "spam", "other"] as const;
export type ReportReason = (typeof VALID_REASONS)[number];

export class InvalidReportError extends Error {}

export interface ReportSummary {
  id: string;
  reportedHandle: string;
  reason: string;
  createdAt: string;
  status: "open" | "reviewed" | "dismissed";
  reporterHandle: string | null;
}

export function listReports(options?: { status?: ReportSummary["status"]; limit?: number }): ReportSummary[] {
  const limit = options?.limit ?? 50;
  const db = getDb();
  const status = options?.status;

  const rows = status
    ? (db
        .prepare(
          `SELECT r.id, r.reported_handle, r.reason, r.created_at, r.status, u.handle as reporter_handle
           FROM reports r
           LEFT JOIN users u ON u.id = r.reporter_id
           WHERE r.status = ?
           ORDER BY r.created_at ASC
           LIMIT ?`,
        )
        .all(status, limit) as {
        id: string;
        reported_handle: string;
        reason: string;
        created_at: string;
        status: string;
        reporter_handle: string | null;
      }[])
    : (db
        .prepare(
          `SELECT r.id, r.reported_handle, r.reason, r.created_at, r.status, u.handle as reporter_handle
           FROM reports r
           LEFT JOIN users u ON u.id = r.reporter_id
           ORDER BY r.created_at DESC
           LIMIT ?`,
        )
        .all(limit) as {
        id: string;
        reported_handle: string;
        reason: string;
        created_at: string;
        status: string;
        reporter_handle: string | null;
      }[]);

  return rows.map((r) => ({
    id: r.id,
    reportedHandle: r.reported_handle,
    reason: r.reason,
    createdAt: r.created_at,
    status: r.status as ReportSummary["status"],
    reporterHandle: r.reporter_handle,
  }));
}

export function listOpenReports(limit = 50): ReportSummary[] {
  return listReports({ status: "open", limit });
}

export function fileReport(reporterId: string | null, reportedHandle: string, reason: string): void {
  if (!VALID_REASONS.includes(reason as ReportReason)) {
    throw new InvalidReportError(`"${reason}" isn't a valid report reason.`);
  }
  const db = getDb();
  db.prepare(
    "INSERT INTO reports (id, reporter_id, reported_handle, reason, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), reporterId, reportedHandle.toLowerCase(), reason, new Date().toISOString());
}
