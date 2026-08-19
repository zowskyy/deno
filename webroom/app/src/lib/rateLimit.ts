import { headers } from "next/headers";
import { getDb } from "./db";

const WINDOW_MS = 60_000;

/** Builds a rate-limit key from a logged-in user id or the request IP. */
export async function rateLimitActorKey(prefix: string, userId: string | null): Promise<string> {
  if (userId) return `${prefix}:${userId}`;
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "anonymous";
  return `${prefix}:${ip}`;
}

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Too many requests. Try again in ${retryAfterSeconds} seconds.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Checks and increments the rate-limit counter for `key` as a single atomic
 * unit: the read, the limit check, and the increment all happen inside one
 * write transaction, so concurrent callers can never both observe a count
 * under the limit and both be allowed through.
 */
export function checkRateLimit(key: string, maxCount: number): void {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  let limitError: RateLimitError | undefined;
  try {
    const now = Date.now();
    const row = db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").get(key) as
      | { count: number; window_start: string }
      | undefined;

    if (!row) {
      db.prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)").run(key, new Date(now).toISOString());
    } else {
      const windowStart = new Date(row.window_start).getTime();
      if (now - windowStart > WINDOW_MS) {
        db.prepare("UPDATE rate_limits SET count = 1, window_start = ? WHERE key = ?").run(new Date(now).toISOString(), key);
      } else if (row.count >= maxCount) {
        limitError = new RateLimitError(Math.ceil((WINDOW_MS - (now - windowStart)) / 1000));
      } else {
        db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  if (limitError) throw limitError;
}
