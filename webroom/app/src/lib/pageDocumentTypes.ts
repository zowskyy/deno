import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 3;

const TEMPLATE_IDS = [
  "soft-web",
  "pixel-tavern",
  "chrome-angel",
  "dark-zine",
  "clean-portfolio",
  "start-simple",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

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
export type PagePartId = (typeof PAGE_PART_IDS)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color");
const httpUrl = z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
  message: "must be http:// or https://",
});
const tagSlug = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "tags must be lowercase letters, numbers, and hyphens");

const ThemeAttributionSchema = z
  .object({
    forkedFromThemeId: z.string().uuid().optional(),
    forkedFromHandle: z.string().trim().max(32).optional(),
    credit: z.string().trim().max(120).optional(),
  })
  .optional();

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

const LinkItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: httpUrl,
});

const IdentitySchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(280),
  status: z.string().trim().max(80).optional(),
  avatarAssetId: z.string().uuid().optional(),
});

const GalleryItemSchema = z.object({
  id: z.string().uuid(),
  url: httpUrl,
  alt: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(280).optional(),
});

const BlogPostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  body: z.string().trim().min(1).max(50000),
  publishedAt: z.string(),
});

const DevlogEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  body: z.string().trim().min(1).max(500),
});

const BadgeSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  emoji: z.string().max(8).optional(),
});

const ShrineSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(5000),
  imageUrl: httpUrl.optional(),
  imageAlt: z.string().trim().max(200).optional(),
});

const PlaylistTrackSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  url: httpUrl,
});

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

const MiniPageSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().trim().min(1).max(120),
  intro: z.string().trim().max(500).default(""),
  body: z.string().trim().max(20000).default(""),
});

const AccessSchema = z.object({
  altTextReminder: z.boolean().default(true),
  contrastWarningsEnabled: z.boolean().default(true),
});

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
  guestbook: z
    .object({
      enabled: z.boolean().default(true),
      requireApproval: z.boolean().default(true),
    })
    .default({ enabled: true, requireApproval: true }),
  access: AccessSchema.default({ altTextReminder: true, contrastWarningsEnabled: true }),
});

export type PageDocument = z.infer<typeof PageDocumentSchema>;
export type Shrine = z.infer<typeof ShrineSchema>;
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;
export type PixelArtPiece = z.infer<typeof PixelArtPieceSchema>;
export type MiniPage = z.infer<typeof MiniPageSchema>;

export interface StoredPage {
  document: PageDocument;
  draftDocument: PageDocument | null;
  isPublished: boolean;
  visibility: "private" | "unlisted" | "public";
  hiddenFromDiscovery: boolean;
  guestbookDisabled: boolean;
  updatedAt: string;
}

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
    guestbook: { enabled: true, requireApproval: true },
    access: { altTextReminder: true, contrastWarningsEnabled: true },
  };
}
