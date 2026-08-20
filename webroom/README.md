# Webroom

**Get lost in decorating, not in menus.**

Webroom is a modern, safer MySpace-style home on the web. Every person gets a profile page they can radically customize — colors, layout, guestbooks, shrines, pixel art, playlists, blogs, and more — and share at a simple URL like `@yourname`. There is no infinite feed, no engagement scores, and no algorithm deciding what you see next. People find each other by wandering, tags, web rings, and friend links: a real social graph you browse on your own terms.

> Make your corner of the internet. Wander into someone else's.

The core question is never *"what are you posting today?"* It's:

> **What does your corner of the internet feel like?**

```text
Make → Shape → Publish → Wander
```

---

## The four screens

Everything in Webroom lives on four screens. No notification center, no DMs, no creator analytics dashboard.

| Screen | What you do | What it's for |
|--------|-------------|---------------|
| **Explore** | Wander | Discover pages by tag, web ring, random browse, and walking friend links |
| **Make** | Create | Start a page through a short guided flow — pick a mood, add your name, choose what belongs on your page |
| **My Page** | Publish | View and share your public space at `@yourhandle` |
| **Studio** | Shape | Change appearance, content, and layout — colors, fonts, section order, gallery, blog, guestbook, and more |

Friends are part of the product from day one: mutual-accept friend links form a visible graph you can browse outward from any page you like. That is discovery by choice, not a feed you're fed.

---

## Quick start

Webroom runs as a Next.js app in `webroom/app`. You need **Node.js 22.5+** (the app uses `node:sqlite` — no separate database install).

```bash
cd webroom/app
npm install
npm test
npm run build
npm run start
```

Then open the app in your browser (default: `http://localhost:3000`).

For local development with hot reload:

```bash
npm run dev
```

---

## What's shipped

Phases 1–5 are **complete** and the release build is **hardened** — schema-validated page documents, adversarial tests, and graceful failure paths are in place throughout.

**Phase 1 — Make a page**
- Accounts and handles · identity, links, now, and friends page parts · mutual-accept friend requests · six starter templates · public profile URL · mobile renderer · Reader Mode · publish/unpublish

**Phase 2 — Shape a page**
- Full five-tab Studio (Look, Layout, Content, Access, Publish) · theme controls · colors, fonts, panels, density · page-part ordering · desktop/mobile preview · undo · save and restore versions · gallery, blog, devlog, badges, and Top 8 page parts

**Phase 3 — Keep it safe**
- Image descriptions · contrast warnings · reduced-motion support · Safe Preview · export/import · hide from discovery · private/unlisted/public visibility · block and report · guestbook approval · rate limits · moderator queue · community policy · appeals · panic mode

**Phase 4 — Wander**
- Recently decorated pages · tags · curated collections · random page · web rings · friend-link graph browsing · guestbooks with approval

**Phase 5 — Rich modules and shared themes**
- Shrine, Playlist (outbound links — no autoplay embeds), Pixel Art, and Mini-page modules · theme gallery · install and fork a theme · attribution · theme version history · theme reporting · scoped custom CSS · Wonder sparks for one-click creative surprises

The test suite currently covers **114 tests** across validation, moderation, discovery, themes, and adversarial edge cases.

**Every public page stays readable** through Reader Mode — decoration can be loud, but visitors are never trapped in chaos. Block, Report, and Reader controls are always visible and cannot be hidden by a theme.

---

## Privacy

**No visitor analytics.** Creators do not get page views, referrers, or any other visitor tracking. This is a deliberate product decision aligned with Webroom's anti-surveillance, anti-feed ethos — not a feature waiting to be added later.

Everything stays on the platform you run. There is no opt-in trend-sharing, telemetry, or anonymized usage collection.

---

## Production deploy

Set the moderator account before or right after your first user signs up:

```bash
WEBROOM_MODERATOR_HANDLE=yourmodhandle
```

On startup, if no moderator exists yet, Webroom promotes the account with that handle to moderator (the account must already exist). This is the recommended production path.

| Variable | Purpose |
|----------|---------|
| `WEBROOM_MODERATOR_HANDLE` | Handle of the account to promote as moderator on first boot |
| `WEBROOM_DB_PATH` | Path to the SQLite database file (default: `webroom/app/webroom.db`) |
| `WEBROOM_AUTO_MODERATOR_SEED` | Set to `true` to promote the first registered user as moderator if no handle is configured (development only) |

---

## Deeper detail

| Document | What it covers |
|----------|----------------|
| [`PLAN.md`](PLAN.md) | Full product vision, roadmap, safety rules, and design decisions |
| [`docs/architecture.md`](docs/architecture.md) | App structure, data flow, module registry, and persistence |
| [`docs/profile-schema.md`](docs/profile-schema.md) | Page document schema and page parts |
| [`docs/security-model.md`](docs/security-model.md) | XSS prevention, untrusted content handling, and safety boundaries |
| [`docs/accessibility.md`](docs/accessibility.md) | Reader Mode, WCAG targets, and accessibility guarantees |
| [`docs/theme-api.md`](docs/theme-api.md) | Theme tokens, scoped CSS, and the shared theme gallery |

---

## A note on this repo

Webroom is a **separate product** from [gateway-probe](../README.md) (the OpenWrt/Linux gateway diagnostic tool in the root of this monorepo). They do not share code or users. Webroom lives in `webroom/` here because it does not yet have its own dedicated repository — when one exists, this directory moves there intact.

---

## What Webroom is not (V1)

No infinite feed · no DMs · no arbitrary HTML or JavaScript in pages · no third-party embeds · no autoplay music · no plugin marketplace · no AI-generated pages · no federation or self-hosting controls at launch · no recommendation algorithms.

Webroom stays ambitious by making expressive personal publishing simple, durable, safe, and accessible — not by shipping every possible social feature.

---

> Make your corner of the internet. Keep it yours.
