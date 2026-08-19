import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

// Password hashing uses Node's built-in crypto.scrypt (no external
// dependency, no native module to compile) rather than bcrypt/argon2
// packages. scrypt is a well-established, still-secure KDF and this is
// the pattern Node's own docs recommend for password storage.

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,29}$/;
const RESERVED_HANDLES = new Set([
  "explore", "make", "studio", "api", "admin", "reader", "report",
  "block", "login", "signup", "logout", "settings", "static", "assets",
  "friends", "guestbook", "webroom", "help", "about", "terms", "privacy",
]);

export class ValidationError extends Error {}

export function validateHandle(rawHandle: string): string {
  const handle = rawHandle.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    throw new ValidationError(
      "Handles must be 2-30 characters: lowercase letters, numbers, hyphens, or underscores, and can't start with a hyphen or underscore.",
    );
  }
  if (RESERVED_HANDLES.has(handle)) {
    throw new ValidationError(`"${handle}" is reserved and can't be used as a handle.`);
  }
  return handle;
}

export function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters.");
  }
  if (password.length > 256) {
    throw new ValidationError("Password is too long.");
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

// A real (but unused-for-login) hash, computed once, purely so
// authenticate() has something correctly formatted to compare against
// when a handle doesn't exist — keeps that codepath's timing shaped the
// same as the real one instead of hand-typing a hex string that could
// silently be the wrong length.
const DUMMY_HASH = hashPassword(randomBytes(32).toString("hex"));

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export interface User {
  id: string;
  handle: string;
  createdAt: string;
}

/** Public lookup by handle — used to resolve /@handle routes. Returns null rather than throwing for "not found," since that's an expected, common case here. */
export function findUserByHandle(rawHandle: string): User | null {
  const handle = rawHandle.trim().toLowerCase();
  const db = getDb();
  const row = db
    .prepare("SELECT id, handle, created_at FROM users WHERE handle_lower = ? AND is_blocked_platform = 0")
    .get(handle) as { id: string; handle: string; created_at: string } | undefined;
  if (!row) return null;
  return { id: row.id, handle: row.handle, createdAt: row.created_at };
}

export class HandleTakenError extends Error {
  constructor(handle: string) {
    super(`The handle "${handle}" is already taken.`);
  }
}

export function createUser(rawHandle: string, password: string): User {
  const handle = validateHandle(rawHandle);
  validatePassword(password);
  const db = getDb();

  const existing = db
    .prepare("SELECT id FROM users WHERE handle_lower = ?")
    .get(handle);
  if (existing) throw new HandleTakenError(handle);

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const passwordHash = hashPassword(password);

  db.prepare(
    `INSERT INTO users (id, handle, handle_lower, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, handle, handle, passwordHash, createdAt);

  return { id, handle, createdAt };
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Incorrect handle or password.");
  }
}

export function authenticate(rawHandle: string, password: string): User {
  const handle = rawHandle.trim().toLowerCase();
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, handle, password_hash, created_at, is_blocked_platform FROM users WHERE handle_lower = ?",
    )
    .get(handle) as
    | { id: string; handle: string; password_hash: string; created_at: string; is_blocked_platform: number }
    | undefined;

  // Always run verifyPassword even on a missing user, against a fixed
  // dummy hash, so a nonexistent-handle response takes the same time as
  // a wrong-password response — don't let response timing leak which
  // handles exist.
  const ok = row ? verifyPassword(password, row.password_hash) : verifyPassword(password, DUMMY_HASH);

  if (!row || !ok) throw new InvalidCredentialsError();
  if (row.is_blocked_platform) throw new InvalidCredentialsError();

  return { id: row.id, handle: row.handle, createdAt: row.created_at };
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Returns the raw session token (only ever shown to the client once, as a cookie value). */
export function createSession(userId: string): string {
  const db = getDb();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  ).run(tokenHash, userId, now.toISOString(), expiresAt.toISOString());

  return rawToken;
}

function hashToken(rawToken: string): string {
  // Sessions are looked up by exact hash match (not scrypt — tokens are
  // already high-entropy random, no need for a slow KDF here), so a
  // fast, deterministic hash is correct and keeps lookups cheap.
  return scryptSync(rawToken, "webroom-session-salt-v1", 32).toString("hex");
}

export function resolveSession(rawToken: string | undefined): User | null {
  if (!rawToken) return null;
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.id, u.handle, u.created_at, s.expires_at, u.is_blocked_platform
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as
    | { id: string; handle: string; created_at: string; expires_at: string; is_blocked_platform: number }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  if (row.is_blocked_platform) return null;

  return { id: row.id, handle: row.handle, createdAt: row.created_at };
}

export function destroySession(rawToken: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(rawToken));
}
