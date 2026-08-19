import { cookies } from "next/headers";
import { createSession, destroySession, resolveSession, type User } from "./auth";

// Thin server-side helpers that connect auth.ts's pure session logic to
// Next.js's cookie jar. Kept separate from auth.ts so auth.ts stays
// framework-free and fully unit-testable without a request context.

const COOKIE_NAME = "webroom_session";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days, matches SESSION_TTL_MS in auth.ts

/** Resolve the current user from the session cookie, if any. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return resolveSession(token);
}

/** Create a session and set the auth cookie for the given user. */
export async function logIn(userId: string): Promise<void> {
  const token = createSession(userId);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/** Destroy the current session and clear the auth cookie. */
export async function logOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) destroySession(token);
  jar.delete(COOKIE_NAME);
}
