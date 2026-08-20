# Webroom Post-V1 Finalization — Deep Research Document

**Purpose:** Everything needed to continue from the current checkpoint and finalize the Webroom post-V1 feature set completely.  
**Audience:** Product owner (vision/judgment) and engineering agents picking up this work.  
**Last verified:** 2026-08-20 UTC · head `7992fa7` · PR [#9](https://github.com/zowskyy/deno/pull/9)

---

## 1. Executive summary

Webroom is a personal-homepage platform (modern MySpace) living in `webroom/app/`. Phases 1–5 and the full **post-V1 feature set** are implemented in code:

- Hosted image/audio uploads
- Direct messages
- Activity feed (friend-prioritized, not engagement-ranked)
- Deterministic recommendations
- Federation profile export + remote follows (SSRF-hardened)
- Plugin marketplace (3 seeded plugins)
- AI page generation (offline templates + optional OpenAI)
- Self-hosting instance URL configuration
- Allowlisted Spotify/YouTube embeds (sandboxed, no autoplay)

**Current gate:** PR #9 is open, mergeable, tests green (220), CodeRabbit CI green — but the standing rule requires an **explicit “Actionable comments posted: 0”** formal review on head `7992fa7` before merge. A `@coderabbitai full review` was posted 2026-08-20 02:41 UTC; awaiting the formal zero-actionable paper trail.

**After merge:** Finalization is not “write more features” — it is verification, deployment, operator setup, branch cleanup, and optional repo separation. The product claims are already shipped in code.

---

## 2. Current state snapshot

### 2.1 Git & PR

| Item | Value |
|------|-------|
| Active branch | `cursor/webroom-post-v1-features-207e` |
| Head commit | `7992fa7` — `fix(webroom): address PR #9 merge blockers across federation, CSS, uploads, migration` |
| Base branch | `claude/gateway-probe-mvp-ueca5r` |
| PR | [#9](https://github.com/zowskyy/deno/pull/9) — open, not draft, **MERGEABLE** |
| Superseded PRs | #8 (`cursor/coderabbit-followups-207e`) closed as superseded by #9 |

### 2.2 Verification (re-run 2026-08-20)

```bash
cd webroom/app && npm test && npm run lint && npm run build
```

| Check | Result |
|-------|--------|
| Tests | **220 passing** (24 files) |
| Lint | **0 errors**, 4 pre-existing warnings (`<img>` in `moduleRegistry.tsx`) |
| Build | **Green** |

### 2.3 CodeRabbit status

| Signal | Status |
|--------|--------|
| CI on `7992fa7` | SUCCESS — “Review completed” |
| Inline comments | **23/23 marked ✅ Addressed** |
| Formal review summaries | Last is **#4977627012** on older commit `3b9157d` — says “2 actionable” (stale) |
| Paper trail requested | `@coderabbitai full review` + `@coderabbitai resume` posted 02:41–02:45 UTC |
| Merge rule | **Do not merge** until explicit “Actionable comments posted: 0” on `7992fa7` |

### 2.4 Six merge-blocker workstreams (implemented in `7992fa7`)

1. **Federation SSRF** — `federation.ts`: HTTPS-only, expanded IPv4/IPv6 private classification, `isIpLiteral()`, DNS/redirect policy documented for future outbound fetches
2. **CSS scoping** — `cssScope.ts`: context-aware `position` checks; `--position` custom properties allowed; `url(javascript:)` / `position: var()` rejected; canonicalized blocked selectors
3. **Upload error handling** — `assets.ts` + `upload/route.ts`: bounded reads, 413 oversize, 400 malformed multipart; route tests added
4. **Plugin migration** — `db.ts`: transactional migration, rollback, skip when legacy rows exist but no users, `resumeDeferredMigrations()` on `createUser()`
5. **Theme report notes** — `sharedThemes.ts`: normalized note reused in DB + audit log; regression test
6. **Taylor docs** — `.cursor/agents/taylor-*.md`, `audit-first-web-product.mdc`: scoped to `webroom/app`, consistent audit/verify order

---

## 3. Feature inventory (what PR #9 ships)

### 3.1 Core product loop (Phases 1–5 — complete)

```
Make → Shape → Publish → Wander
```

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Accounts, templates, friends, publish, Reader Mode | ✅ |
| 2 | Full Studio (5 tabs), versions, gallery/blog/devlog/badges/Top 8 | ✅ |
| 3 | Safety: block/report, guestbook approval, moderation, appeals, panic mode | ✅ |
| 4 | Explore: tags, rings, collections, random, friend-graph walks | ✅ |
| 5 | Shrine, Playlist, Pixel Art, Mini-pages, theme gallery, scoped CSS | ✅ |

### 3.2 Post-V1 features (this PR)

| Feature | Key modules | Routes / surfaces |
|---------|-------------|-------------------|
| Hosted uploads | `assets.ts`, `assetUrls.ts` | `POST /api/assets/upload`, `GET /api/assets/[id]` |
| Direct messages | `directMessages.ts` | `/messages` |
| Activity feed | `feed.ts` | `/feed` |
| Recommendations | `recommendations.ts` | Used in explore/discovery flows |
| Federation | `federation.ts`, `instance.ts` | `GET /api/federation/profile/[handle]`, `/instance` |
| Plugin marketplace | `plugins.ts`, `moduleRegistry.tsx` | `/marketplace` |
| AI page generation | `aiPages.ts`, `aiGenerateRequest.ts` | `POST /api/ai/generate`, Studio AI assist |
| Spotify/YouTube embeds | `embeds.ts` | Playlist module (sandboxed iframes) |
| Self-hosting config | `instance.ts` | `/instance` |

### 3.3 Permanently excluded

- **Visitor analytics** — no page views, referrers, or tracking (product decision, not deferred)
- Arbitrary HTML/JS in pages
- Autoplay media
- Algorithmic engagement ranking

---

## 4. Architecture deep dive

### 4.1 Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16.3.1 (App Router) | `webroom/app/` |
| Runtime | Node ≥ 22.5 | Required for experimental `node:sqlite` |
| Validation | Zod 3 | Page documents, API inputs |
| Persistence | SQLite (`node:sqlite`) | Single file, no external DB |
| Tests | Vitest 4 | Node environment, `src/**/*.test.ts` |
| Styling | CSS tokens + scoped custom CSS | `cssScope.ts` enforces safety |

### 4.2 Data model (29 tables)

Core groups in `webroom/app/src/lib/schema.sql`:

- **Identity:** `users`, `sessions`
- **Pages:** `page_documents`, `page_document_versions`
- **Social:** `friend_links`, `blocks`, `guestbook_entries`, `direct_messages`, `feed_events`
- **Discovery:** `page_tags`, `web_rings`, `web_ring_members`, `collections`, `collection_pages`
- **Safety:** `reports`, `moderator_logs`, `theme_reports`, `appeals`, `rate_limits`
- **Themes:** `shared_themes`, `theme_versions`
- **Media:** `user_assets`
- **Federation:** `instance_settings`, `federation_follows`
- **Plugins:** `marketplace_plugins`, `installed_plugins`

### 4.3 Request flow

```
Browser form / API
  → Server action or route handler
  → lib/*.ts (auth, Zod, rate limits)
  → SQLite via getDb()
  → Page document re-read + Zod parse
  → PageRenderer + moduleRegistry (public)
```

### 4.4 Page document model

- Every page is versioned JSON validated by Zod (`pageDocument.ts`, `pageDocumentTypes.ts`)
- 14 core module types + plugin extensions via `moduleRegistry.tsx`
- Unknown module types render `UnsupportedModule` — never crash
- Draft vs published: `draft_document_json` for Safe Preview
- Version cap: 50 per page in `page_document_versions`

### 4.5 Security boundaries

| Surface | Mitigation | Module |
|---------|------------|--------|
| XSS | Plain text rendering, URL validation | `pageDocument.ts`, `PageRenderer.tsx` |
| CSS escape | Scoped rules, blocked selectors/patterns | `cssScope.ts` |
| SSRF (federation) | HTTPS-only, private IP rejection, DNS policy | `federation.ts` |
| Upload abuse | Bounded body read, MIME/size limits, auth | `assets.ts` |
| Spam | Rate limits on signup, login, guestbook, DMs, reports | `rateLimit.ts` |
| Cross-account access | Session check on every mutation | `session.ts`, `auth.ts` |
| Data corruption | Zod on read, transactional migrations | `db.ts`, `pageDocument.ts` |

Full threat model: `webroom/docs/security-model.md`

---

## 5. Environment variables (production)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `WEBROOM_DB_PATH` | No | `webroom/app/webroom.db` | SQLite file path |
| `WEBROOM_UPLOAD_DIR` | No | `webroom/app/uploads` | Hosted media directory |
| `WEBROOM_MAX_UPLOAD_BYTES` | No | Per-kind (5MB img, 15MB audio) | Upload cap override |
| `WEBROOM_MODERATOR_HANDLE` | **Yes for prod** | — | Promote moderator on first `/moderation` visit |
| `WEBROOM_AUTO_MODERATOR_SEED` | No | off | Dev only: first user becomes mod |
| `WEBROOM_INSTANCE_URL` | For federation | — | Public base URL for profile exports |
| `WEBROOM_AI_API_KEY` | No | — | OpenAI key for LLM page generation |
| `WEBROOM_AI_MODEL` | No | `gpt-4o-mini` | Model when AI key set |
| `NODE_ENV=production` | **Yes for prod** | — | Secure session cookies |

---

## 6. Route map

### 6.1 Platform (authenticated shell)

| Path | Purpose |
|------|---------|
| `/` | Landing |
| `/signup`, `/login`, `/logout` | Auth |
| `/make` | Guided page creation + AI assist |
| `/studio` | Full 5-tab editor |
| `/explore` (+ tag/ring/collection/random/friends subroutes) | Discovery |
| `/explore/themes` | Theme gallery |
| `/feed` | Activity feed |
| `/messages` | Direct messages |
| `/marketplace` | Plugin install |
| `/instance` | Federation / self-host config |
| `/settings` | Blocks, guestbook moderation, panic mode |
| `/moderation` | Moderator queue |
| `/appeal` | Platform-block appeals |
| `/policy` | Community policy |

### 6.2 Public profiles

| Path | Purpose |
|------|---------|
| `/@{handle}` | Public profile |
| `/@{handle}/blog/[slug]` | Blog post |
| `/@{handle}/p/[slug]` | Mini-page |
| `/@{handle}/block`, `/report` | Safety flows |

### 6.3 API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/assets/upload` | Required |
| GET | `/api/assets/[id]` | Public |
| POST | `/api/ai/generate` | Required |
| GET | `/api/federation/profile/[handle]` | Public |

---

## 7. Test coverage matrix

### 7.1 Covered (24 test files, 220 tests)

| Area | File(s) | Tests |
|------|---------|-------|
| Auth & handles | `auth.test.ts` | 23 |
| Page documents | `pageDocument.test.ts` | 28 |
| CSS safety | `cssScope.test.ts` | 24 |
| Federation | `federation.test.ts` | 29 |
| Friends | `friends.test.ts` | 21 |
| Embeds | `embeds.test.ts` | 10 |
| Discovery | `discovery.test.ts` | 9 |
| Moderation | `moderation.test.ts` | 8 |
| DB migrations | `db.test.ts` | 8 |
| Studio actions | `studioActions.test.ts` | 7 |
| Uploads | `assets.test.ts`, `upload/route.test.ts` | 10 |
| Appeals | `appeals.test.ts` | 6 |
| Themes | `sharedThemes.test.ts` | 5 |
| Rate limits | `rateLimit.test.ts` | 5 |
| Color/contrast | `color.test.ts` | 5 |
| DMs | `directMessages.test.ts` | 4 |
| AI | `aiPages.test.ts`, `aiGenerateRequest.test.ts` | 7 |
| Feed | `feed.test.ts` | 2 |
| Plugins | `plugins.test.ts`, `moduleRegistry.test.ts` | 4 |
| Recommendations | `recommendations.test.ts` | 1 |
| Creative sparks | `creativeSparks.test.ts` | 4 |

### 7.2 Lib modules without dedicated tests (12)

`assetUrls.ts`, `collections.ts`, `guestbook.ts`, `handleParam.ts`, `instance.ts`, `pageDocumentTheme.ts`, `pageDocumentTypes.ts`, `reports.ts`, `session.ts`, `studioValidation.ts`, `templates.ts`, `webRings.ts`

**Risk:** Low for finalization — most are thin wrappers or covered indirectly. Add tests only if a gap surfaces in manual QA or post-merge incident.

### 7.3 Adversarial cases already tested

- CSS: escape sequences, `position: var()`, `url(javascript:)`, blocked selectors with escapes
- Federation: private IPv4/IPv6, metadata IP, hostname vs literal
- Uploads: oversize (413), malformed multipart (400), auth (401)
- DB: migration rollback, idempotent re-run, deferred migration on first user
- Feed: composite cursor (friend tier + timestamp + id)
- Embeds: Spotify/YouTube canonical round-trip

---

## 8. Critical path to merge (immediate)

```
1. Wait for CodeRabbit full review on 7992fa7
   └─ Expect: "Actionable comments posted: 0"
   └─ If >0: fix minimally + regression test + push + re-ping

2. Merge PR #9 → claude/gateway-probe-mvp-ueca5r
   └─ Only after explicit zero-actionable confirmation

3. Post-merge verification on merged base
   └─ cd webroom/app && npm test && npm run lint && npm run build
   └─ npm run start → manual smoke test (see §9)

4. Close superseded branches/PRs if any remain open
```

### 8.1 If CodeRabbit does not post formal zero

Options (in order of preference):

1. Wait longer (full reviews can take 10–30 minutes)
2. Re-post `@coderabbitai full review` (no new commits — avoid auto-pause)
3. Check [Change Stack UI](https://app.coderabbit.ai/change-stack/zowskyy/deno/pull/9) for review state
4. As last resort: product owner manually confirms merge based on 23/23 addressed + CI green (violates standing rule — document the exception)

---

## 9. Post-merge finalization checklist

### 9.1 Automated gates

- [ ] `npm test` — 220+ passing
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — green
- [ ] No `TODO`/`FIXME` in `webroom/app/src` (currently zero)

### 9.2 Manual smoke test (two accounts)

Run `npm run start` at `http://localhost:3000`.

| Flow | Steps | Pass criteria |
|------|-------|---------------|
| Signup → Make → Publish | Account A creates page, publishes | Live at `/@handleA` |
| Studio edit | Change theme, add gallery image via upload | Upload succeeds, page renders |
| Friends | A sends request, B accepts | Both see friend link |
| Feed | A publishes/redecorates | B sees event in `/feed` |
| Messages | A sends DM to B | B receives, can reply |
| Explore | Tag browse, random page | Pages load, no crash |
| Reader Mode | Visit any themed page | Clean readable fallback |
| Block/Report | B blocks A | A cannot re-friend or guestbook |
| Moderation | Mod reviews report | Queue action logged |
| Marketplace | Install quote-card plugin | Renders on page |
| Instance | Set `WEBROOM_INSTANCE_URL`, export profile | JSON at `/api/federation/profile/[handle]` |
| AI (optional) | With `WEBROOM_AI_API_KEY`, generate page draft | Returns valid page JSON or graceful offline fallback |

### 9.3 Production deployment

Webroom has **no container/CI deploy config in-repo** — deployment is operator-driven.

Minimum production setup:

1. **Host** with Node 22.5+, persistent disk for SQLite + uploads
2. **Environment:**
   ```bash
   export NODE_ENV=production
   export WEBROOM_DB_PATH=/var/lib/webroom/webroom.db
   export WEBROOM_UPLOAD_DIR=/var/lib/webroom/uploads
   export WEBROOM_MODERATOR_HANDLE=yourmodhandle
   export WEBROOM_INSTANCE_URL=https://yourdomain.com
   # Optional:
   export WEBROOM_AI_API_KEY=sk-...
   ```
3. **Build & run:**
   ```bash
   cd webroom/app && npm ci && npm run build && npm run start
   ```
4. **Reverse proxy** (nginx/Caddy) for HTTPS — required for secure cookies and federation
5. **Backup:** SQLite file + uploads directory on schedule
6. **First boot:** Create moderator account, visit `/moderation` to confirm promotion

### 9.4 Documentation sync

After merge, verify these match reality:

| Doc | Path | Check |
|-----|------|-------|
| Product plan | `webroom/PLAN.md` | Post-V1 section matches shipped features |
| README | `webroom/README.md` | Test count, env vars, quick start |
| Architecture | `webroom/docs/architecture.md` | Module list, data flow |
| Security | `webroom/docs/security-model.md` | CSS/embed/federation notes current |
| Profile schema | `webroom/docs/profile-schema.md` | All 14+ module types documented |
| Theme API | `webroom/docs/theme-api.md` | Scoped CSS rules |
| Accessibility | `webroom/docs/accessibility.md` | Reader Mode, contrast |

### 9.5 Repo hygiene

| Action | Branches |
|--------|----------|
| Merge & delete | `cursor/webroom-post-v1-features-207e` (after #9) |
| Close as superseded | `cursor/coderabbit-followups-207e` (#8 — already closed) |
| Evaluate for closure | `cursor/webroom-phase5-complete-207e`, `cursor/webroom-phases-1-4-207e`, `cursor/webroom-release-build-207e`, `cursor/webroom-unified-release-207e` |
| Keep separate | `claude/gateway-probe-mvp-ueca5r` (gateway-probe base) |

### 9.6 Optional: dedicated Webroom repository

`webroom/PLAN.md` notes Webroom should eventually move to its own repo. Blocker: GitHub integration cannot create repos (`403`). **User action:** create empty `webroom` repo at github.com/new → move `webroom/` directory → seed `CLAUDE.md` from gateway-probe standards. Not blocking finalization.

---

## 10. Known limitations & risks

### 10.1 Technical

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| `node:sqlite` is experimental | API may change in future Node | Pin Node version; `db.ts` is the only swap point |
| Single SQLite file | No horizontal scale | Acceptable for pilot; Postgres path documented in architecture.md |
| No `middleware.ts` | Auth checked per-route | Consistent but requires discipline on new routes |
| 4 lint warnings (`<img>`) | Performance, not security | Low priority; use `next/image` later |
| Federation has no outbound HTTP yet | `followRemoteProfile` validates URL only | SSRF policy pre-documented for when fetch is added |
| AI generation needs external API | Costs, key management | Graceful offline fallback exists |

### 10.2 Operational

| Risk | Mitigation |
|------|------------|
| No automated backups | Document backup procedure for DB + uploads |
| Moderator bootstrap | Must set `WEBROOM_MODERATOR_HANDLE` before going public |
| Upload disk growth | Monitor `WEBROOM_UPLOAD_DIR`; set `WEBROOM_MAX_UPLOAD_BYTES` |
| No rate limit on AI endpoint alone beyond auth | `aiPages.ts` has generation limits — verify under load |

### 10.3 Product

| Open decision | Status |
|---------------|--------|
| Visitor analytics | **Decided: never** |
| Sustainability/funding | Ongoing; raise when user base exists |
| Dedicated repo | Waiting on user creating empty GitHub repo |

---

## 11. Definition of “done” (project finalized)

The post-V1 feature is **complete** when all of the following are true:

### Code complete ✅ (already)
- All post-V1 features implemented and tested
- Six merge-blocker workstreams addressed
- 220 tests passing, build green
- No stub/placeholder pages

### Review complete ⏳ (in progress)
- CodeRabbit formal review: **“Actionable comments posted: 0”** on `7992fa7`
- All 23 inline findings marked ✅ Addressed (already true)

### Merge complete ⬜
- PR #9 merged to base branch
- Post-merge test suite green on merged commit

### Ship-ready ⬜
- Manual two-account smoke test passed (§9.2)
- Production env documented and deployable (§9.3)
- Moderator account bootstrapped
- Superseded branches closed

### Optional polish (not blocking)
- Dedicated `webroom` GitHub repository
- `next/image` migration for lint warnings
- Tests for 12 untested lib modules
- Container/deploy automation (Docker, CI)

---

## 12. Key file reference

### 12.1 Post-V1 feature files

```
webroom/app/src/lib/
  assets.ts          — upload parsing, size limits, asset storage
  assetUrls.ts       — public asset URL helpers
  directMessages.ts  — DM threads, read status
  feed.ts            — activity events, composite cursor pagination
  recommendations.ts — deterministic scoring
  federation.ts      — profile export validation, SSRF guards
  instance.ts        — instance URL, remote follow storage
  plugins.ts         — marketplace catalog, per-user installs
  aiPages.ts         — template + LLM page generation
  aiGenerateRequest.ts — AI request validation
  embeds.ts          — Spotify/YouTube allowlist

webroom/app/src/app/
  (platform)/feed/page.tsx
  (platform)/messages/
  (platform)/marketplace/
  (platform)/instance/
  api/assets/upload/route.ts
  api/assets/[id]/route.ts
  api/ai/generate/route.ts
  api/federation/profile/[handle]/route.ts
```

### 12.2 Safety-critical files

```
webroom/app/src/lib/cssScope.ts       — CSS sanitization
webroom/app/src/lib/pageDocument.ts   — Zod schema, visibility enforcement
webroom/app/src/lib/moderation.ts     — moderator bootstrap, queue
webroom/app/src/lib/rateLimit.ts      — abuse prevention
webroom/app/src/lib/db.ts             — migrations, transactions
webroom/app/src/components/PageRenderer.tsx — public rendering + Reader Mode
```

### 12.3 Taylor / audit tooling

```
.cursor/agents/taylor-auditor.md
.cursor/agents/taylor-verifier.md
.cursor/rules/audit-first-web-product.mdc  — scoped to webroom/app/**
```

---

## 13. Commands cheat sheet

```bash
# Development
cd webroom/app
npm install
npm run dev          # hot reload at :3000

# Verification gate (run before every push)
npm test && npm run lint && npm run build

# Production
NODE_ENV=production \
WEBROOM_DB_PATH=/var/lib/webroom/webroom.db \
WEBROOM_UPLOAD_DIR=/var/lib/webroom/uploads \
WEBROOM_MODERATOR_HANDLE=modhandle \
WEBROOM_INSTANCE_URL=https://example.com \
npm run start

# Check PR / CodeRabbit (from repo root)
unset GH_TOKEN
gh pr view 9 --repo zowskyy/deno --json statusCheckRollup,headRefOid
gh api repos/zowskyy/deno/pulls/9/reviews | jq '[.[]|select(.user.login=="coderabbitai[bot]")]|.[-1].body|split("\n")[0]'
```

---

## 14. What NOT to do

Per standing project rules (`CLAUDE.md`, `audit-first-web-product.mdc`):

- **Do not merge PR #9** until CodeRabbit posts explicit zero actionable (unless product owner overrides in writing)
- **Do not add visitor analytics** — permanently excluded
- **Do not let gateway-probe material leak** into Webroom user-facing docs
- **Do not hand the product owner technical prerequisites** — agents handle implementation
- **Do not drop/truncate user data tables** without explicit confirmation
- **Do not bypass validation or test failures** to “ship faster”
- **Do not reintroduce the four-condition CAKE test** as a Webroom blocker (gateway-probe only)

---

## 15. Next agent actions (ordered)

1. **Poll CodeRabbit** — check for formal “Actionable comments posted: 0” on `7992fa7`
2. **If zero:** merge PR #9
3. **If actionable:** fix root cause + regression test + push + `@coderabbitai review`
4. **Post-merge:** run full verification gate + manual smoke test (§9.2)
5. **Deploy:** bootstrap moderator, set env vars, HTTPS reverse proxy
6. **Cleanup:** close superseded Webroom branches
7. **Optional:** prompt user to create dedicated `webroom` GitHub repo

---

*This document is the single source of truth for continuing Webroom post-V1 finalization from the `7992fa7` checkpoint. Update it when merge lands, deploy completes, or scope changes.*
