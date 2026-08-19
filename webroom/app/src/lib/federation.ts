import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getPageDocument } from "./pageDocument";
import { getInstanceUrl } from "./instance";

/** Error thrown when federation operations fail. */
export class FederationError extends Error {}

/** Exported profile payload for remote instances. */
export interface FederatedProfileExport {
  instance: string;
  handle: string;
  displayName: string;
  bio: string;
  tags: string[];
  exportedAt: string;
}

/** Remote profile follow record. */
export interface FederationFollow {
  id: string;
  instanceDomain: string;
  remoteHandle: string;
  displayName: string;
  followedAt: string;
}

/** Export a local user's public profile for federation. */
export function exportLocalProfile(handle: string): FederatedProfileExport | null {
  const db = getDb();
  const user = db
    .prepare("SELECT id, handle FROM users WHERE handle_lower = ?")
    .get(handle.toLowerCase()) as { id: string; handle: string } | undefined;
  if (!user) return null;

  const stored = getPageDocument(user.id);
  if (!stored?.isPublished || stored.visibility === "private") return null;

  return {
    instance: getInstanceUrl(),
    handle: user.handle,
    displayName: stored.document.identity.displayName,
    bio: stored.document.identity.bio,
    tags: stored.document.tags,
    exportedAt: new Date().toISOString(),
  };
}

/** Follow a remote profile by URL (HTTPS only, blocks private IPs). */
export function followRemoteProfile(followerUserId: string, profileUrl: string): FederationFollow {
  let url: URL;
  try {
    url = new URL(profileUrl.trim());
  } catch {
    throw new FederationError("Invalid profile URL.");
  }
  if (url.protocol !== "https:") {
    throw new FederationError("Profile URL must be https.");
  }
  const host = url.hostname;
  if (isPrivateHost(host)) throw new FederationError("Cannot import profiles from private network addresses.");

  const id = randomUUID();
  const now = new Date().toISOString();
  const db = getDb();

  const pathParts = url.pathname.split("/").filter(Boolean);
  const remoteHandle = pathParts[pathParts.length - 1]?.replace(/^@/, "") ?? "unknown";

  const profileJson = JSON.stringify({
    instance: `${url.protocol}//${url.host}`,
    handle: remoteHandle,
    sourceUrl: profileUrl,
    importedAt: now,
  });

  db.prepare(
    `INSERT INTO federation_follows (id, follower_user_id, instance_domain, remote_handle, profile_json, followed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(follower_user_id, instance_domain, remote_handle) DO UPDATE SET profile_json = excluded.profile_json`,
  ).run(id, followerUserId, host, remoteHandle, profileJson, now);

  return {
    id,
    instanceDomain: host,
    remoteHandle,
    displayName: remoteHandle,
    followedAt: now,
  };
}

/** List remote profiles the user follows. */
export function listFederationFollows(userId: string): FederationFollow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, instance_domain, remote_handle, profile_json, followed_at
       FROM federation_follows WHERE follower_user_id = ? ORDER BY followed_at DESC`,
    )
    .all(userId) as {
    id: string;
    instance_domain: string;
    remote_handle: string;
    profile_json: string;
    followed_at: string;
  }[];

  return rows.map((r) => {
    let displayName = r.remote_handle;
    try {
      const parsed = JSON.parse(r.profile_json) as { displayName?: string };
      if (parsed.displayName) displayName = parsed.displayName;
    } catch {
      /* keep handle */
    }
    return {
      id: r.id,
      instanceDomain: r.instance_domain,
      remoteHandle: r.remote_handle,
      displayName,
      followedAt: r.followed_at,
    };
  });
}

/** Return true for localhost, loopback, link-local, and private-network hostnames. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local")) return true;

  if (h.includes(":")) {
    return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
  }

  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;

  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
