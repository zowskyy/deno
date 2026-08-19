import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export interface WebRing {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface WebRingMember {
  handle: string;
  displayName: string;
  position: number;
}

export function listWebRings(): WebRing[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, slug, name, description FROM web_rings ORDER BY name ASC")
    .all() as { id: string; slug: string; name: string; description: string }[];
  return rows;
}

export function getWebRingBySlug(slug: string): WebRing | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, slug, name, description FROM web_rings WHERE slug = ?")
    .get(slug) as { id: string; slug: string; name: string; description: string } | undefined;
  return row ?? null;
}

export function listRingMembers(ringId: string): WebRingMember[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.handle, pd.document_json, wrm.position
       FROM web_ring_members wrm
       JOIN users u ON u.id = wrm.user_id
       JOIN page_documents pd ON pd.user_id = wrm.user_id
       WHERE wrm.ring_id = ?
         AND pd.is_published = 1 AND pd.visibility = 'public' AND pd.hidden_from_discovery = 0
       ORDER BY wrm.position ASC, wrm.joined_at ASC`,
    )
    .all(ringId) as { handle: string; document_json: string; position: number }[];

  return rows.map((r) => {
    let displayName = r.handle;
    try {
      const doc = JSON.parse(r.document_json) as { identity?: { displayName?: string } };
      if (doc.identity?.displayName) displayName = doc.identity.displayName;
    } catch { /* fall back */ }
    return { handle: r.handle, displayName, position: r.position };
  });
}

export function getRingNavigation(ringId: string, currentUserId: string): { prev: WebRingMember | null; next: WebRingMember | null } {
  const members = listRingMembers(ringId);
  const idx = members.findIndex((m) => {
    const user = getDb().prepare("SELECT id FROM users WHERE handle = ?").get(m.handle) as { id: string } | undefined;
    return user?.id === currentUserId;
  });
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? members[idx - 1]! : null,
    next: idx < members.length - 1 ? members[idx + 1]! : null,
  };
}

/** Rings a user belongs to — for profile badges and navigation. */
export function listUserWebRings(userId: string): WebRing[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT wr.id, wr.slug, wr.name, wr.description
       FROM web_rings wr
       JOIN web_ring_members wrm ON wrm.ring_id = wr.id
       WHERE wrm.user_id = ?
       ORDER BY wr.name ASC`,
    )
    .all(userId) as { id: string; slug: string; name: string; description: string }[];
  return rows;
}

export function ensureSeedRings(): void {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM web_rings").get() as { c: number };
  if (count.c > 0) return;

  const rings = [
    { slug: "soft-web-webring", name: "Soft Web Webring", description: "Gentle pages, warm colors, quiet corners." },
    { slug: "pixel-tavern-ring", name: "Pixel Tavern Ring", description: "Retro vibes, monospace energy, late-night pages." },
    { slug: "creative-coders", name: "Creative Coders", description: "People making things and writing about the process." },
  ];
  const now = new Date().toISOString();
  for (const ring of rings) {
    db.prepare("INSERT INTO web_rings (id, slug, name, description, created_at) VALUES (?, ?, ?, ?, ?)").run(
      randomUUID(), ring.slug, ring.name, ring.description, now,
    );
  }
}
