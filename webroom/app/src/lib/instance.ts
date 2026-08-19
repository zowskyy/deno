import { getDb } from "./db";

/** Return a configured instance setting value, or null when unset. */
export function getInstanceSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM instance_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

/** Persist an instance-level configuration value. */
export function setInstanceSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO instance_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

/** Canonical public base URL for this Webroom instance (no trailing slash). */
export function getInstanceUrl(): string {
  const fromEnv = process.env.WEBROOM_INSTANCE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const stored = getInstanceSetting("instance_url");
  if (stored) return stored.replace(/\/$/, "");
  return "http://localhost:3000";
}

/** Store the instance URL for self-hosted deployments. */
export function configureInstanceUrl(url: string): void {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw new Error("Instance URL must start with http:// or https://");
  }
  setInstanceSetting("instance_url", trimmed);
}
