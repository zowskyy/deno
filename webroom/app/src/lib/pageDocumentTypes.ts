import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 2;

const TEMPLATE_IDS = [
  "soft-web",
  "pixel-tavern",
  "chrome-angel",
  "dark-zine",
  "clean-portfolio",
  "start-simple",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const PAGE_PART_IDS = [
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

const ThemeSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  accent: hexColor,
  background: hexColor,
  density: z.enum(["cozy", "comfortable", "spacious"]).default("comfortable"),
  fontStyle: z.enum(["serif", "sans", "mono"]).default("sans"),
  reduceMotion: z.boolean().default(false),
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
  guestbook: z
    .object({
      enabled: z.boolean().default(true),
      requireApproval: z.boolean().default(true),
    })
    .default({ enabled: true, requireApproval: true }),
  access: AccessSchema.default({ altTextReminder: true, contrastWarningsEnabled: true }),
});

export type PageDocument = z.infer<typeof PageDocumentSchema>;

export interface StoredPage {
  document: PageDocument;
  draftDocument: PageDocument | null;
  isPublished: boolean;
  visibility: "private" | "unlisted" | "public";
  hiddenFromDiscovery: boolean;
  guestbookDisabled: boolean;
  updatedAt: string;
}
