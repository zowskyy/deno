# Webroom

**Get lost in decorating, not in menus.**

Webroom is a modern, safer MySpace-style home on the web. Every person gets a profile page they can radically customize — colors, layout, guestbooks, shrines, pixel art, playlists, blogs, and more — and share at a simple URL like `@yourname`. There is no infinite feed, no engagement scores, and no algorithm deciding what you see next. People find each other by wandering, tags, web rings, and friend links: a real social graph you browse on your own terms.

> Make your corner of the internet. Wander into someone else's.

The core question is never *"what are you posting today?"* It's:

> **What does your corner of the internet feel like?**

```
Make → Shape → Publish → Wander
```

---

## The four screens (+ post-V1)

Everything in Webroom lives on four core screens, plus post-V1 additions for messaging, activity, plugins, and self-hosting. No notification center and no creator analytics dashboard.

| Screen | What you do | What it's for |
|--------|-------------|---------------|
| **Explore** | Wander | Discover pages by tag, web ring, random browse, and walking friend links |
| **Make** | Create | Start a page through a short guided flow — pick a mood, add your name, choose what belongs on your page |
| **My Page** | Publish | View and share your public space at `@yourhandle` |
| **Studio** | Shape | Change appearance, content, and layout — colors, fonts, section order, gallery, blog, guestbook, and more |
| **Feed** | Catch up | Activity from friends and public updates — ranked by connection, not engagement scores |
| **Messages** | Talk privately | Direct messages between accounts — no public thread |
| **Plugins** | Extend | Install structured page modules from the marketplace |
| **Instance** | Self-host | Configure your instance URL and follow remote profiles |

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
- Shrine, Playlist (hosted audio, outbound links, and allowlisted Spotify/YouTube embeds — no autoplay), Pixel Art, and Mini-page modules · theme gallery · install and fork a theme · attribution · theme version history · theme reporting · scoped custom CSS · Wonder sparks for one-click creative surprises

**Post-V1 — Hosted media, social, and federation**
- Webroom-hosted image and audio uploads (gallery, shrine, playlist, avatar) · direct messages · activity feed with friend-prioritized ranking · deterministic recommendations (tags + friend-of-friend + recency) · federation profile export and remote follows · plugin marketplace · AI page generation (template-based offline, optional LLM with API key) · self-hosting instance URL configuration

**Still never shipped:** visitor analytics (page views, referrers, tracking).

The test suite covers validation, moderation, discovery, themes, and adversarial edge cases. Run `npm test` in `webroom/app` to verify the current count.

**Every public page stays readable** through Reader Mode — decoration can be loud, but visitors are never trapped in chaos. Block, Report, and Reader controls are always visible and cannot be hidden by a theme.

---

## Privacy

**No visitor analytics.** Creators do not get page views, referrers, or any other visitor tracking. This is a deliberate product decision aligned with Webroom's anti-surveillance, anti-feed ethos — not a feature waiting to be added later.

Everything stays on the platform you run. There is no opt-in trend-sharing, telemetry, or anonymized usage collection.

---

## Production deploy

1. Create the moderator account and sign up with your chosen handle.
2. Set the environment variable before loading `/moderation`:

```bash
export WEBROOM_MODERATOR_HANDLE=yourmodhandle
```

3. Visit `/moderation` while signed in as a different account (or have the moderator account visit it). Webroom promotes the configured handle on first moderator-queue load when no moderator exists yet.

| Variable | Purpose |
|----------|---------|
| `WEBROOM_MODERATOR_HANDLE` | Handle to promote as moderator on first `/moderation` visit (account must already exist) |
| `WEBROOM_DB_PATH` | Path to the SQLite database file (default: `webroom/app/webroom.db`) |
| `WEBROOM_AUTO_MODERATOR_SEED` | Set to `true` to promote the first registered user as moderator if no handle is configured (development only) |
| `WEBROOM_INSTANCE_URL` | Public base URL for this instance (federation exports) |
| `WEBROOM_UPLOAD_DIR` | Directory for hosted user uploads (default: `webroom/app/uploads`) |
| `WEBROOM_MAX_UPLOAD_BYTES` | Maximum upload size in bytes (default: 5MB images, 15MB audio) |
| `WEBROOM_AI_API_KEY` | Optional OpenAI API key for LLM-backed page generation |
| `WEBROOM_AI_MODEL` | OpenAI model name when using AI generation (default: `gpt-4o-mini`) |

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

## What Webroom deliberately excludes

No visitor analytics (page views, referrers, tracking) — this is permanent. No arbitrary HTML or JavaScript in pages. No autoplay music. No engagement-score ranking in the feed.

Webroom stays ambitious by making expressive personal publishing simple, durable, safe, and accessible — not by surveillance or algorithmic manipulation.

---

> Make your corner of the internet. Keep it yours.
