import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { getDb } from "./db";
import { getPageDocument } from "./pageDocument";
import { getInstanceUrl } from "./instance";

/** Error thrown when federation operations fail. */
export class FederationError extends Error {}

/** Outbound federation fetch policy: redirects must be manual with per-hop revalidation. */
export const FEDERATION_OUTBOUND_FETCH_POLICY = {
  redirect: "manual" as const,
  maxRedirects: 0,
  /** Revalidate URL + resolved addresses before every manual redirect follow. */
  revalidateEachRedirect: true,
};

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

/** Parse and validate a remote federation profile URL for safe storage (HTTPS, no private literals). */
export function validateFederationProfileUrl(profileUrl: string): URL {
  let url: URL;
  try {
    url = new URL(profileUrl.trim());
  } catch {
    throw new FederationError("Invalid profile URL.");
  }
  if (url.protocol !== "https:") {
    throw new FederationError("Profile URL must be https.");
  }
  if (isPrivateHost(url.hostname)) {
    throw new FederationError("Cannot import profiles from private network addresses.");
  }
  return url;
}

/** Reject resolved addresses that point at private, loopback, link-local, or metadata networks. */
export function validateFederationResolvedAddresses(hostname: string, addresses: string[]): void {
  if (addresses.length === 0) {
    throw new FederationError("Cannot resolve federation host.");
  }
  for (const address of addresses) {
    if (isPrivateHost(address)) {
      throw new FederationError(`Cannot reach federation host ${hostname}: private network address.`);
    }
  }
}

/** DNS-resolve a federation hostname and reject unsafe target addresses. */
export async function assertFederationHostnameResolvesSafely(hostname: string): Promise<void> {
  if (isPrivateHost(hostname)) {
    throw new FederationError("Cannot import profiles from private network addresses.");
  }
  if (isIpLiteral(hostname)) return;

  const records = await lookup(hostname, { all: true });
  validateFederationResolvedAddresses(
    hostname,
    records.map((record) => record.address),
  );
}

/** Validate an outbound federation fetch target (URL literal checks; call DNS helper before connecting). */
export function validateFederationOutboundUrl(url: URL): void {
  if (url.protocol !== "https:") {
    throw new FederationError("Federation fetch URL must be https.");
  }
  if (isPrivateHost(url.hostname)) {
    throw new FederationError("Federation fetch blocked: private network address.");
  }
}

/** Follow a remote profile by URL (HTTPS only, blocks private IPs). No outbound fetch yet — URL stored after validation. */
export function followRemoteProfile(followerUserId: string, profileUrl: string): FederationFollow {
  const url = validateFederationProfileUrl(profileUrl);
  const host = url.hostname;

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

/** Return true when the host string is an IPv4 or IPv6 literal. */
export function isIpLiteral(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h.includes(":")) return true;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(h);
}

/** Return true for localhost, loopback, link-local, and private-network hostnames or IP literals. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local")) return true;

  if (h.includes(":")) {
    return isPrivateIpv6(h);
  }

  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    return isPrivateIpv4(h);
  }

  if (/^127(?:\.\d{1,3}){0,3}$/.test(h)) return true;

  return false;
}

/** Return true for private, loopback, link-local, multicast, or carrier-grade NAT IPv4 literals. */
function isPrivateIpv4(host: string): boolean {
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;

  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** Return true for loopback, unspecified, ULA, link-local, multicast, or IPv4-mapped private IPv6 literals. */
function isPrivateIpv6(host: string): boolean {
  if (host === "::" || host === "::1") return true;

  const v4Mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Mapped) return isPrivateIpv4(v4Mapped[1]!);

  const firstHextet = host.split(":")[0] ?? "";
  const firstValue = parseInt(firstHextet, 16);
  if (!Number.isFinite(firstValue)) return false;
  if (firstValue >= 0xfc00 && firstValue <= 0xfdff) return true;
  if (firstValue >= 0xfe80 && firstValue <= 0xfebf) return true;
  if (firstValue >= 0xff00) return true;

  return false;
}
