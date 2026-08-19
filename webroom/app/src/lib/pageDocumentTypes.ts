import { z } from "zod";

/** Current page document schema version. */
export const CURRENT_SCHEMA_VERSION = 3;

/** Allowed page template identifiers. */
const TEMPLATE_IDS = [
  "soft-web",
  "pixel-tavern",
  "chrome-angel",
  "dark-zine",
  "clean-portfolio",
  "start-simple",
] as const;
/** Page template theme identifier. */
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Ordered list of renderable page section identifiers. */
export const PAGE_PART_IDS = [
  "identity",
  "friends",
  "links",
  "now",
  "gallery",
  "blog",
  "devlog",
  "guestbook",
  "topEight",
  "badges",
  "shrine",
  "playlist",
  "pixelArt",
  "miniPages",
] as const;
/** Page section identifier used in the pageParts array. */
export type PagePartId = (typeof PAGE_PART_IDS)[number];

/** Zod schema for a six-digit hex color string. */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color");
/** Zod schema for an http:// or https:// URL. */
const httpUrl = z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
  message: "must be http:// or https://",
});
/** Zod schema for a lowercase page tag slug. */
const tagSlug = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "tags must be lowercase letters, numbers, and hyphens");

/** Optional theme fork attribution metadata. */
const ThemeAttributionSchema = z
  .object({
    forkedFromThemeId: z.string().uuid().optional(),
    forkedFromHandle: z.string().trim().max(32).optional(),
    credit: z.string().trim().max(120).optional(),
  })
  .optional();

/** Visual theme settings for a page document. */
const ThemeSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  accent: hexColor,
  background: hexColor,
  density: z.enum(["cozy", "comfortable", "spacious"]).default("comfortable"),
  fontStyle: z.enum(["serif", "sans", "mono"]).default("sans"),
  reduceMotion: z.boolean().default(false),
  customCss: z.string().max(8000).default(""),
  customCssEnabled: z.boolean().default(false),
  attribution: ThemeAttributionSchema,
});

/** External link shown on a profile page. */
const LinkItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: httpUrl,
});

/** Profile identity block (display name, bio, status). */
const IdentitySchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(280),
  status: z.string().trim().max(80).optional(),
  avatarAssetId: z.string().uuid().optional(),
});

/** Allowlisted third-party embed in a playlist track. */
const EmbedSchema = z.object({
  provider: z.enum(["spotify", "youtube"]),
  embedUrl: z.string().url(),
});

/** Image entry in the page gallery module. */
const GalleryItemSchema = z
  .object({
    id: z.string().uuid(),
    url: httpUrl.optional(),
    assetId: z.string().uuid().optional(),
    alt: z.string().trim().min(1).max(200),
    caption: z.string().trim().max(280).optional(),
  })
  .refine((item) => !!(item.url || item.assetId), { message: "gallery item needs url or assetId" });

/** Blog post embedded in a page document. */
const BlogPostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  body: z.string().trim().min(1).max(50000),
  publishedAt: z.string(),
});

/** Short dated devlog entry on a page. */
const DevlogEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  body: z.string().trim().min(1).max(500),
});

/** Decorative badge displayed on a profile. */
const BadgeSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  emoji: z.string().max(8).optional(),
});

/** Fan shrine content block with optional image. */
const ShrineSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(5000),
  imageUrl: httpUrl.optional(),
  imageAssetId: z.string().uuid().optional(),
  imageAlt: z.string().trim().max(200).optional(),
});

/** Track, hosted audio, or allowlisted embed in the playlist module. */
const PlaylistTrackSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    url: httpUrl.optional(),
    assetId: z.string().uuid().optional(),
    embed: EmbedSchema.optional(),
  })
  .refine((t) => !!(t.url || t.assetId || t.embed), {
    message: "playlist track needs url, assetId, or embed",
  });

/** Pixel art grid piece with dimensions and color cells. */
const PixelArtPieceSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().max(80).optional(),
    width: z.number().int().min(4).max(24),
    height: z.number().int().min(4).max(24),
    pixels: z.array(z.union([hexColor, z.literal("transparent")])),
  })
  .refine((p) => p.pixels.length === p.width * p.height, {
    message: "pixel array length must equal width × height",
  });

/** Sub-page linked from a profile with its own slug and body. */
const MiniPageSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().trim().min(1).max(120),
  intro: z.string().trim().max(500).default(""),
  body: z.string().trim().max(20000).default(""),
});

/** Accessibility and authoring preference flags. */
const AccessSchema = z.object({
  altTextReminder: z.boolean().default(true),
  contrastWarningsEnabled: z.boolean().default(true),
});

/** User-installed plugin module instance on a page. */
const PagePluginInstanceSchema = z.object({
  id: z.string().uuid(),
  pluginSlug: z.string().trim().min(1).max(64),
  data: z.record(z.string(), z.unknown()),
});

/** Zod schema for a complete version-3 page document. */
export const PageDocumentSchema = z.object({
  version: z.literal(CURRENT_SCHEMA_VERSION),
  identity: IdentitySchema,
  theme: ThemeSchema,
  pageParts: z.array(z.enum(PAGE_PART_IDS)).max(PAGE_PART_IDS.length),
  links: z.array(LinkItemSchema).max(30).default([]),
  now: z.string().trim().max(280).default(""),
  gallery: z.array(GalleryItemSchema).max(12).default([]),
  blog: z.array(BlogPostSchema).max(50).default([]),
  devlog: z.array(DevlogEntrySchema).max(100).default([]),
  badges: z.array(BadgeSchema).max(20).default([]),
  topEight: z.array(z.string().trim().min(1).max(32)).max(8).default([]),
  tags: z.array(tagSlug).max(10).default([]),
  shrines: z.array(ShrineSchema).max(5).default([]),
  playlist: z.array(PlaylistTrackSchema).max(20).default([]),
  pixelArt: z.array(PixelArtPieceSchema).max(10).default([]),
  miniPages: z.array(MiniPageSchema).max(10).default([]),
  plugins: z.array(PagePluginInstanceSchema).max(10).default([]),
  guestbook: z
    .object({
      enabled: z.boolean().default(true),
      requireApproval: z.boolean().default(true),
    })
    .default({ enabled: true, requireApproval: true }),
  access: AccessSchema.default({ altTextReminder: true, contrastWarningsEnabled: true }),
});

/** Validated page document shape (schema version 3). */
export type PageDocument = z.infer<typeof PageDocumentSchema>;
/** Fan shrine module entry type. */
export type Shrine = z.infer<typeof ShrineSchema>;
/** Playlist module track entry type. */
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;
/** Pixel art module piece type. */
export type PixelArtPiece = z.infer<typeof PixelArtPieceSchema>;
/** Mini-page module entry type. */
export type MiniPage = z.infer<typeof MiniPageSchema>;
/** Installed plugin module instance on a page. */
export type PagePluginInstance = z.infer<typeof PagePluginInstanceSchema>;

/** Persisted page document plus publish, visibility, and draft metadata. */
export interface StoredPage {
  document: PageDocument;
  draftDocument: PageDocument | null;
  isPublished: boolean;
  visibility: "private" | "unlisted" | "public";
  hiddenFromDiscovery: boolean;
  guestbookDisabled: boolean;
  updatedAt: string;
}

/** Default empty v3 page sections used during migration and new documents. */
export function defaultPageDocumentFieldsV3() {
  return {
    gallery: [] as PageDocument["gallery"],
    blog: [] as PageDocument["blog"],
    devlog: [] as PageDocument["devlog"],
    badges: [] as PageDocument["badges"],
    topEight: [] as PageDocument["topEight"],
    tags: [] as PageDocument["tags"],
    shrines: [] as PageDocument["shrines"],
    playlist: [] as PageDocument["playlist"],
    pixelArt: [] as PageDocument["pixelArt"],
    miniPages: [] as PageDocument["miniPages"],
    plugins: [] as PageDocument["plugins"],
    guestbook: { enabled: true, requireApproval: true },
    access: { altTextReminder: true, contrastWarningsEnabled: true },
  };
}
