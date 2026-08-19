# Webroom architecture

Webroom is a Next.js 16 app (`webroom/app`) backed by `node:sqlite`. Every user page is a versioned, Zod-validated JSON document — not arbitrary HTML.

## Boot flow

1. `src/app/layout.tsx` — global fonts, `SiteNav`, CSS tokens.
2. Platform routes under `src/app/(platform)/` — Make, Studio, Explore, Settings, Moderation.
3. Public profiles at `src/app/[handle]/` — `/@handle`, blog posts, mini-pages, block/report.

## Data flow

```
User action (form/server action)
  → lib/*.ts validation (Zod, rate limits, auth)
  → SQLite (schema.sql)
  → Page document reread
  → PageRenderer via moduleRegistry
```

## Module registry

`src/lib/moduleRegistry.tsx` defines every page part (identity, shrine, playlist, pixel art, mini-pages, etc.). `PageRenderer` walks `document.pageParts` in order and calls `renderPagePart`. Unknown parts render a recoverable unsupported card — they never crash the page.

## Theme engine

- Starter templates: `pageDocumentTheme.ts` (`TEMPLATE_PRESETS`)
- Per-page tokens: accent, background, density, fontStyle, reduceMotion
- Scoped custom CSS: `cssScope.ts` scopes rules to `.profile-scope--{handle}`
- Shared theme gallery: `sharedThemes.ts` + `/explore/themes`

## Persistence boundaries

- **Page documents** — `page_documents.document_json` (+ optional `draft_document_json` for safe preview)
- **Version history** — `page_document_versions` (cap 50)
- **Social** — `friend_links`, `blocks`, `guestbook_entries`
- **Discovery** — `page_tags`, `web_rings`, `collections`
- **Moderation** — `reports`, `moderator_logs`, `theme_reports`

## Future backend integration

The `lib/` modules are framework-agnostic where possible. Swapping SQLite for Postgres means changing `db.ts` only — call sites stay the same.
