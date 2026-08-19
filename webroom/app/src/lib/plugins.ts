import { randomUUID } from "node:crypto";
import { getDb } from "./db";

/** Plugin manifest describing an installable page module. */
export interface PluginManifest {
  slug: string;
  name: string;
  description: string;
  moduleType: string;
  defaultData: Record<string, unknown>;
}

/** Marketplace plugin listing. */
export interface MarketplacePlugin {
  id: string;
  slug: string;
  name: string;
  description: string;
  manifest: PluginManifest;
}

/** Installed plugin on this instance for one user. */
export interface InstalledPlugin {
  id: string;
  slug: string;
  manifest: PluginManifest;
  installedAt: string;
}

const SEED_PLUGINS: PluginManifest[] = [
  {
    slug: "quote-card",
    name: "Quote Card",
    description: "A pull-quote block for your page",
    moduleType: "quoteCard",
    defaultData: { quote: "Make your corner of the internet.", attribution: "" },
  },
  {
    slug: "countdown",
    name: "Countdown",
    description: "Count down to an event or release",
    moduleType: "countdown",
    defaultData: { label: "Coming soon", targetDate: "" },
  },
  {
    slug: "currently-reading",
    name: "Currently Reading",
    description: "Share what you're reading right now",
    moduleType: "currentlyReading",
    defaultData: { title: "", author: "" },
  },
];

/** Seed marketplace catalog when empty. */
export function ensureSeedMarketplacePlugins(): void {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM marketplace_plugins").get() as { c: number };
  if (count.c > 0) return;

  const now = new Date().toISOString();
  for (const manifest of SEED_PLUGINS) {
    db.prepare(
      `INSERT INTO marketplace_plugins (id, slug, name, description, manifest_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), manifest.slug, manifest.name, manifest.description, JSON.stringify(manifest), now);
  }
}

/** List plugins available in the marketplace. */
export function listMarketplacePlugins(): MarketplacePlugin[] {
  ensureSeedMarketplacePlugins();
  const db = getDb();
  const rows = db
    .prepare("SELECT id, slug, name, description, manifest_json FROM marketplace_plugins ORDER BY name")
    .all() as { id: string; slug: string; name: string; description: string; manifest_json: string }[];

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    manifest: JSON.parse(r.manifest_json) as PluginManifest,
  }));
}

/** Install a marketplace plugin for the authenticated user. */
export function installMarketplacePlugin(userId: string, slug: string): InstalledPlugin {
  const db = getDb();
  const row = db
    .prepare("SELECT manifest_json FROM marketplace_plugins WHERE slug = ?")
    .get(slug) as { manifest_json: string } | undefined;
  if (!row) throw new Error(`Plugin not found: ${slug}`);

  const manifest = JSON.parse(row.manifest_json) as PluginManifest;
  const existing = db
    .prepare("SELECT id, installed_at FROM installed_plugins WHERE user_id = ? AND slug = ?")
    .get(userId, slug) as { id: string; installed_at: string } | undefined;

  const id = existing?.id ?? randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO installed_plugins (id, user_id, slug, manifest_json, installed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, slug) DO UPDATE SET manifest_json = excluded.manifest_json`,
  ).run(id, userId, slug, row.manifest_json, existing?.installed_at ?? now);

  return { id, slug, manifest, installedAt: existing?.installed_at ?? now };
}

/** List plugins installed by a user. */
export function listInstalledPlugins(userId: string): InstalledPlugin[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, slug, manifest_json, installed_at FROM installed_plugins WHERE user_id = ? ORDER BY installed_at",
    )
    .all(userId) as { id: string; slug: string; manifest_json: string; installed_at: string }[];

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    manifest: JSON.parse(r.manifest_json) as PluginManifest,
    installedAt: r.installed_at,
  }));
}

/** User plugin instance data stored on a page document. */
export interface PagePluginInstance {
  id: string;
  pluginSlug: string;
  data: Record<string, unknown>;
}
