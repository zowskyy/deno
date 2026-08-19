import { getDb } from "./db";

const WINDOW_MS = 60_000;

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Too many requests. Try again in ${retryAfterSeconds} seconds.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function checkRateLimit(key: string, maxCount: number): void {
  const db = getDb();
  const now = Date.now();
  const row = db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").get(key) as
    | { count: number; window_start: string }
    | undefined;

  if (!row) {
    db.prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)").run(key, new Date(now).toISOString());
    return;
  }

  const windowStart = new Date(row.window_start).getTime();
  if (now - windowStart > WINDOW_MS) {
    db.prepare("UPDATE rate_limits SET count = 1, window_start = ? WHERE key = ?").run(new Date(now).toISOString(), key);
    return;
  }

  if (row.count >= maxCount) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - windowStart)) / 1000);
    throw new RateLimitError(retryAfter);
  }

  db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
}
