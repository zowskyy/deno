# Webroom

**A simple place to make and explore personal homepages.** People create a
page that feels like them, publish it safely, and wander through other
people's pages without feeds, algorithms, or pressure to perform.

> Make your corner of the internet. Keep it yours.

```
Make → Shape → Publish → Wander
```

This is a separate product from `gateway-probe` (the other project in this
repo). It lives in its own `webroom/` directory because it doesn't have a
dedicated repository yet — see "A note on where this lives" at the bottom.

## What it is

Not social media with feeds, DMs, trends, and engagement scores. Not a full
website builder or code sandbox either.

It is a **personal-page platform**: make a public page, choose a visual
mood, add a few meaningful sections, change it over time, browse other
handmade pages, and keep ownership of what you made — export it, and it's
still yours.

Accessibility is part of the product contract, not a later feature: every
page needs a readable, keyboard-usable fallback even when its decoration is
highly expressive (WCAG 2.2 is the relevant standard here).

## The four screens, and nothing else in V1

| Screen | Verb | Purpose |
|---|---|---|
| **Explore** | Wander | Discover pages, tags, collections, web rings |
| **Make** | Create | Start a page from a short guided flow |
| **My Page** | Publish | View and share your public space |
| **Studio** | Shape | Change appearance, content, and layout |

No feed, marketplace, DMs, trend screen, notification center, analytics
dashboard, plugin screen, or federation controls in V1.

## First five minutes

1. **Pick a feeling** — Soft Web, Pixel Tavern, Chrome Angel, Dark Zine,
   Clean Portfolio, or start simple. A starting mood, not a final answer.
2. **Add your name and one sentence.** That's the whole "who are you" step.
3. **Pick what belongs on your page** — about me, links, what you're
   making, gallery, guestbook, top 8, badges.
4. **Publish.** Live at `webroom/@yourname`. Keep editing any time.

A first-time user should be able to publish a readable page in under five
minutes — that's the Phase 1 success test below, not just a nice-to-have.

## Page parts

Not "widgets" — the actual things people put in their own space. Each one
ships with a mobile layout, a Reader Mode version, keyboard support, and
privacy settings from day one:

**Identity** (name, avatar, bio, status) · **Links** (curated external
links) · **Now** (what you're making, playing, feeling) · **Gallery** (a
few images with descriptions) · **Devlog** (short dated updates) ·
**Guestbook** (owner-approved messages) · **Top 8** (favorite people or
pages) · **Badges** (stamps, collections, web rings)

## The Studio

Five tabs, no freeform drag-everything canvas. Ordered sections produce
better pages, work better on mobile, and stay accessible by construction.

**Look** (colors, background, text style, mood) · **Layout** (section
order, spacing, density) · **Content** (name, bio, links, gallery,
guestbook) · **Access** (Reader Mode, contrast, motion, alt text) ·
**Publish** (save, share, restore a version, export)

## The underlying layer: what this inherits from gateway-probe

A Webroom page is not a tiny custom website — it's a structured, versioned
document: profile data + theme choices + approved page parts + assets.
That decision is what makes the rest of the product possible, and it's the
same engineering discipline established on `gateway-probe` this session,
carried over rather than reinvented:

| gateway-probe pattern | Webroom equivalent |
|---|---|
| Read-only by default; the one mutating tool is opt-in and auto-reverts | Studio changes are always reversible — every edit is a save, not a commit; undo and version-restore always exist |
| Every report is a structured, versioned, schema-validated document | Page JSON is versioned, validated, and portable — never opaque |
| Never a crash, never a silent wrong answer — honest, specific failure messages | Reader Mode is the honest fallback; a page can be chaotic, it can never trap or fail a visitor |
| Every claim needs a test that could fail — adversarial cases included | Injection attempts, malformed page JSON, oversized uploads get tested before ship, not assumed handled |
| "No customer support required" — foreseeable failure modes get handled up front | Same standard, applied here from Phase 1, not bolted on after launch |

## Safety rules

A profile can be loud, strange, or dense with personality. It cannot
become a website that runs code.

**Never in a profile:** JavaScript, arbitrary HTML, login forms, popups,
automatic redirects, third-party embeds/remote scripts, hidden
report/block controls, autoplay media (V1).

**Allowed in V1:** structured text, approved links, validated images,
theme colors and approved fonts, background styles, section ordering,
badges/stamps/decorative assets.

Untrusted content is handled as data in the correct output context, never
inserted directly into HTML, script, CSS, or URLs (OWASP's XSS prevention
guidance is the relevant reference).

## Reader Mode & Safe Preview

The two most important safety features:

- **Reader Mode** — any visitor gets clean, readable content, decoration
  stripped. A theme cannot hide, copy, or override this or the
  Reader/Block/Report bar at the top of every page.
- **Safe Preview** — the owner can hide draft theme changes without
  deleting them.

> A page can be chaotic. It cannot trap a visitor in chaos.

## Discovery

Recently redecorated pages, browse-by-feeling, browse-by-interest, a
random page, and web rings — curated and moderated, not algorithmically
ranked. Public does not automatically mean searchable, featured, or
recommended; that separation is what keeps moderation manageable at any
size.

## Moderation (V1)

**Visitors:** block, report, hide from discovery, Reader Mode, block
guestbook contact.

**Creators:** guestbook approval, private/unlisted/public, hide from
search, disable guestbook, panic mode (hide page from discovery quickly),
restore a previous version, export page data.

**Platform:** report review queue, rate limits, asset validation, a clear
community policy, moderator logs, appeals.

Federation, self-hosting, shared block lists, and remote-server trust
controls come later — only after the hosted product has real moderation
operations behind it. Do not decentralize at launch.

## Roadmap

### Phase 1 — Make a page *(start here)*

Account and handle · structured profile data · identity/links/now page
parts · three templates · public profile URL · mobile renderer · Reader
Mode · publish/unpublish.

**Success test:** a first-time user publishes a readable page in under
five minutes.

### Phase 2 — Shape a page

Theme controls · template selection · colors/fonts/panels/density ·
page-part order · desktop/mobile preview · undo · save version · restore
version.

**Success test:** test users make pages that visibly differ without
touching code.

### Phase 3 — Keep it safe

Image descriptions · contrast warnings · reduced-motion support · Safe
Preview · export/import · hide from discovery · private/unlisted/public ·
block and report.

**Success test:** every public page stays readable and navigable through
Reader Mode.

### Phase 4 — Wander

Recently decorated pages · tags · curated collections · random page · web
rings · guestbooks with approval · rate limits · moderator queue.

**Success test:** visitors find interesting pages with no feed, and
creators can avoid unwanted contact entirely.

### Phase 5 — Share themes *(later)*

Theme gallery · install · fork · attribution · theme version history ·
theme reporting.

**Success test:** someone reuses and remixes a theme without losing
creator credit or accessibility guarantees.

## What V1 excludes

Infinite feed, DMs, arbitrary CSS/HTML, JavaScript in pages, third-party
embeds, autoplay music, plugin system, marketplace, AI-generated pages,
federation, self-hosting, recommendation algorithms, real-time
collaborative editing.

The product stays ambitious by making expressive personal publishing
simple, durable, safe, and accessible — not by shipping every possible
social or creator feature.

## Decisions

Two real product calls, surfaced now rather than guessed at, to be
decided when there's enough real signal — not before:

- **Visitor privacy.** Do creators get any visit analytics (page views,
  referrers) for their own page? The product's whole ethos is
  anti-surveillance and anti-feed — leaning toward none, or at most a
  private, un-exported view count, seems consistent. Worth deciding
  before Phase 1 ships, not added quietly later.
- **Sustainability — ongoing, not one-time.** A hosted platform with
  human moderation has real running costs. A funding path (subscription
  for extra storage/themes, donations, sponsorship) stays in view
  continuously and gets raised again once there's a real user base to
  point to — not before, and not solved today.

## Closing

Webroom is a safe place to build and explore personal homepages. Pick a
feeling, add the parts of your life or work you want to share, and
publish a page you can keep changing. Visitors find handmade spaces
through tags, collections, web rings, and wandering — never a feed.

> Make your corner of the internet. Wander into someone else's.

---

## A note on where this lives

Webroom doesn't have its own repository yet. I tried to create one
(`webroom`) so it would have a clean, separate home the way `gateway-probe`
does, but the GitHub access this session has doesn't include permission to
create new repositories (`403 Resource not accessible by integration`) —
that's a real tool limitation, not a decision I made. This plan lives here
in a `webroom/` folder inside the `deno` repo instead, so nothing is lost
and work can continue.

Whenever it's convenient, creating an empty `webroom` repository on
GitHub is a very small ask — a few clicks at github.com/new, no code or
configuration needed — and everything here can move over immediately once
it exists, with its own `CLAUDE.md` working agreement seeded from the same
standards as `gateway-probe`'s. Not blocking anything in the meantime.
