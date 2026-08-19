# Profile schema

Canonical shape: `PageDocument` in `src/lib/pageDocumentTypes.ts` (schema version **3**).

## Top-level fields

| Field | Purpose |
|-------|---------|
| `identity` | displayName, bio, optional status |
| `theme` | template, colors, density, font, custom CSS, attribution |
| `pageParts` | ordered list of enabled module ids |
| `links`, `now` | curated links and status line |
| `gallery`, `blog`, `devlog`, `badges` | media and writing modules |
| `topEight` | friend handles to feature |
| `shrines`, `playlist`, `pixelArt`, `miniPages` | Phase 5 rich modules |
| `tags` | discovery tags (synced to `page_tags` table on save) |
| `guestbook` | enabled / requireApproval flags |
| `access` | alt-text reminders, contrast warnings |

## Migration

`migrateDocument()` in `pageDocument.ts` upgrades v1 and v2 documents to v3 without data loss. Never write unvalidated JSON to `page_documents`.

## Export / import

Studio Publish tab exports a JSON package with `document`, publish state, and visibility. Import validates through `parsePageDocument()` before save.

## Mini-pages

Stored in `document.miniPages[]`. Public URL: `/@{handle}/p/{slug}`.

## Blog posts

Stored in `document.blog[]`. Public URL: `/@{handle}/blog/{slug}`.
