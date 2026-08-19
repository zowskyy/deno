# Security model

## Core rule

A profile can be loud and strange. It cannot run code or trap a visitor.

## No arbitrary HTML

All user content is plain text rendered by React — never `dangerouslySetInnerHTML` with user input. Links and images use validated `http://` / `https://` URLs only.

## No JavaScript in pages

Page documents cannot include scripts, embeds, iframes, or `javascript:` URLs. Playlist is outbound links only — no embedded players.

## CSS scoping

Custom CSS is scoped to `.profile-scope--{handle}` and filtered by `cssScope.ts`. Reader Mode strips theme decoration entirely.

CSS sanitization is not a complete security boundary for arbitrary CSS — if full user HTML/CSS is ever added, it must render in an isolated origin with a restrictive CSP.

## Auth and sessions

Passwords: scrypt. Session tokens: random 32-byte, hashed in DB, 30-day HTTP-only cookie.

## Social safety

- Friend requests require mutual accept
- Blocks prevent requests, guestbook sign, and profile visibility
- Rate limits on reports, guestbook, friend actions, theme fork/publish, login, signup, and appeals
- Moderator queue for page reports, theme reports, and platform-block appeals
- Private visibility is enforced on all page routes — not just discovery filters

## Threat model (MVP)

| Threat | Mitigation |
|--------|------------|
| XSS via page content | Plain text + URL validation |
| CSS escape to hide safety bar | Scope + blocked selectors |
| Spam guestbook / friend requests | Rate limits + approval |
| Cross-account data access | Per-user SQL queries, session check |
| Malformed stored JSON | Zod parse on every read |
