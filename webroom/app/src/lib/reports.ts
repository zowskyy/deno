import { randomUUID } from "node:crypto";
import { getDb } from "./db";

const VALID_REASONS = ["harassment", "impersonation", "unsafe-content", "spam", "other"] as const;
export type ReportReason = (typeof VALID_REASONS)[number];

export class InvalidReportError extends Error {}

export function fileReport(reporterId: string | null, reportedHandle: string, reason: string): void {
  if (!VALID_REASONS.includes(reason as ReportReason)) {
    throw new InvalidReportError(`"${reason}" isn't a valid report reason.`);
  }
  const db = getDb();
  db.prepare(
    "INSERT INTO reports (id, reporter_id, reported_handle, reason, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), reporterId, reportedHandle.toLowerCase(), reason, new Date().toISOString());
}
