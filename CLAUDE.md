# Working agreement for this project

## The quality bar: no customer support required

This is the standard every product built here is held to, and it's stated
first because it governs every other decision below.

Most of the software industry treats support tickets as an acceptable
cost of shipping — a bug or gap in the product becomes a person's problem
to explain to another person, who reads from a script that often doesn't
even address what was actually asked. That's not a neutral trade-off,
it's a design failure being quietly outsourced to the customer's time and
patience, and it's exactly the pattern this work exists to not repeat.

The standard: **build it complete enough, and handle enough of the
foreseeable edge cases up front, that a support conversation for a known,
previously-encountered issue should never need to happen.** Not "build it
fast and patch complaints later." Not "ship an MVP and let users discover
the gaps." If a failure mode is foreseeable — and most of the ones people
actually call support about are exactly that: common, previously seen,
entirely predictable — the software should already detect it, explain it,
or handle it, before a user ever needs to ask another human.

In practice this is not a slogan, it's the same concrete discipline
already used on this project and expected on every future one:

- **Every claim needs a test that could have failed**, including
  deliberately adversarial ones — missing tools, malformed input,
  concurrent/racing operations, corrupt state, partial failures. A
  passing-only test suite is not evidence of quality; it's evidence
  nobody tried to break it yet.
- **Audit before declaring something done**, especially anything that
  touches real state, safety, or money. Re-verify claims against the
  actual code and actual execution, not against how confident the
  implementation sounds.
- **Graceful degradation is not optional polish** — a missing dependency,
  an unreachable service, a malformed file, should produce an honest,
  specific, actionable result, never a crash and never a silent wrong
  answer.
- **Fix root causes, not symptoms.** A workaround that makes a symptom go
  away while leaving the underlying gap in place is the exact pattern
  that produces the kind of unhelpful support interaction this standard
  exists to prevent.
- **When a real gap surfaces anyway** — and some always will, from cases
  genuinely nobody could have foreseen — that becomes the next thing
  fixed at the root, not a line added to an FAQ telling people to work
  around it.

This standard applies globally, across every project, not only this one.

## Who the user is

The user is the **visionary and product owner** — not an engineer. They
see problems in the world and know what a solution *should feel like* and
*do*, but they do not code, do not know technical implementation details,
and should never be required to. Their job is the idea and the judgment
call on whether something matches their vision. My job is everything
between "here's an idea" and "here's a working thing."

## What this means in practice

- **Never hand the user a technical task as a prerequisite.** No "SSH into
  X," "install Y," "run this command," "edit this config" as something
  *they* must do to unblock me. If a task requires touching real-world
  hardware or accounts only the user can access (their router, their bank,
  their phone), find the path that needs the fewest, simplest, most
  plain-language steps from them — or do it myself if I have a way to.
- **Explain in outcomes, not mechanisms.** Prefer "this makes your CAKE
  measurement tool testable and safe" over "this refactors the retention
  tiering logic." Save the technical detail for when they ask for it.
- **Don't leave them holding an unfinished technical thread.** If a
  necessary step turns out to require the user to do something technical
  (e.g. physical access to their own hardware), that step should be
  optional/deferred by default — offer to keep making progress on
  everything else rather than blocking on it.
- **Take the initiative on implementation choices.** Architecture,
  libraries, deployment approach, testing strategy — all mine to decide
  and execute. Surface a choice to the user only when it's a genuine
  product/business tradeoff they'd care about (cost, privacy, timeline,
  positioning) — not a technical one.
- **Translate vision into a plan myself.** When the user describes an idea
  in narrative/aspirational terms, my job is to turn it into a concrete,
  scoped, buildable plan without asking them to specify technical
  requirements — infer reasonable defaults and state them plainly so they
  can redirect if wrong.
- **When something needs the user's real-world action**, make it the
  smallest possible ask, in plain language, one step at a time — not a
  wall of commands or jargon. If it's still too much, that's a signal to
  find a different path, not to explain harder.

## Standing context

This repo now hosts two separate products. They don't share code or
users — keep their concerns, docs, and community-facing material
separate (e.g. don't let Webroom material leak into what gateway-probe
pilot testers see when they clone the repo for its README/install docs).

### gateway-probe

- `gateway-probe`, a read-only OpenWrt/Linux gateway diagnostic tool
  (bufferbloat/CAKE measurement). See `README.md` and
  `deployment/DEPLOYMENT.md` for what exists.
- Long-term direction: open-source, community-driven (r/openwrt,
  homelab audience first), aimed at eventually supporting supervised
  automatic QoS tuning. See the roadmap artifact / prior planning notes
  in conversation history for the fuller three-phase plan if picking
  this back up.
- The real-world four-condition CAKE test (on the user's own router) is
  **deferred, not blocking** — it needs physical access to their home
  network, which isn't always available. Don't reintroduce it as a
  requirement; offer it as an optional next step when the user has Wi-Fi
  access and bandwidth for it.
- **Privacy — decided, not open**: no opt-in trend-sharing, telemetry, or
  anonymized usage collection, ever. Everything stays strictly local to
  the user's own gateway. Don't design future features (e.g. a possible
  Phase 3 cloud dashboard) around collecting data from other users —
  the cloud view described in Phase 3 must stay opt-in-per-user and
  local-first, never depend on aggregating anyone else's data.
- **Phase 3 direction (Wi-Fi diagnostics vs. multi-gateway vs. other)**:
  deliberately left undecided. That answer comes from what pilot users
  and the community actually ask for during Phase 1, not from deciding
  in advance — don't pre-commit to one direction.
- **Sustainability**: per the global standing principle, keep a
  long-term funding path (sponsorship/grants/etc.) in view as this
  project matures, and raise it again once there's a real milestone to
  point to (a published case study, a proven Phase 2 result) — not
  before there's something credible to fund.

### Webroom

- A personal-homepage platform — make a page, give it a mood, publish
  it safely, wander other people's pages without a feed or algorithm.
  Full plan: `webroom/PLAN.md`.
- **Doesn't have its own repo yet.** Tried to create one and hit a real
  tool limitation (this session's GitHub access can't create new
  repositories — `403 Resource not accessible by integration`), so the
  plan lives in `webroom/PLAN.md` in this repo for now. Move it to a
  dedicated `webroom` repo the moment one exists (small ask: the user
  creating an empty repo at github.com/new takes a few clicks, no code
  needed) — don't treat staying in `deno` as a permanent decision.
- **Explicitly builds on the same engineering discipline as
  gateway-probe** — structured/versioned documents, read-only-by-default
  with explicit reversible mutation, schema validation, graceful
  degradation, adversarial testing. See the "underlying layer" section
  of `webroom/PLAN.md` for the concrete pattern-by-pattern mapping. Keep
  applying that same discipline to Webroom's build, not a lighter
  version of it.
- **Privacy (visitor analytics) — decided: none.** No page views, referrers,
  or visitor tracking for creators. Aligns with the anti-surveillance ethos.
- **Sustainability**: ongoing standing consideration, not solved now —
  same principle as gateway-probe. A hosted platform with human
  moderation has real running costs; raise funding path again once
  there's a real user base to point to.
- **Webroom Phases 1–5 are complete** in `webroom/app` (Next.js/TypeScript,
  `node:sqlite`, Zod-validated page documents, module registry, scoped
  custom CSS, theme gallery). Signup → Make → Studio → publish → Explore
  all work end-to-end. Release hardening includes visibility enforcement,
  auth rate limits,   community policy, appeals, and theme-report moderation. Run `npm test` in
  `webroom/app` to verify the suite.
- Friends (the mutual-accept graph) shipped as part of Phase 1, per the
  plan's explicit call that it's core to the product, not a later
  add-on.
- Next session picking this up: run `npm install && npm run build` in
  `webroom/app`, `npm test` for the suite, `npm run start` to run it
  locally. `node:sqlite` is still an experimental Node API (tracked
  deliberately — zero native-compile, zero external service dependency
  — not an oversight).
- **Taylor worker system** — multi-step Webroom work uses specialist
  agents in `.cursor/agents/taylor-*.md`. Orchestrator (`taylor-orchestrator`)
  plans waves and file ownership; implementer, auditor, verifier, and
  product-writer run in tandem with handoff artifacts (migration note,
  type note, test list, env note). See `.cursor/agents/README.md`.
  **Permanent out of scope for all workers:** visitor analytics.
  **Owner-directed post-V1 build scope:** hosted uploads, DMs, feed,
  recommendations, federation, self-hosting, allowlisted embeds, plugin
  marketplace, AI page assist — full code, no stubs.
- **Audit-first workflow (Cursor)** — all non-trivial Webroom changes
  follow plan-before-code, test-before-implementation, adversarial-review-
  before-merge. Permanent rule: `.cursor/rules/audit-first-web-product.mdc`.
  High-risk surfaces: publishing/visibility, custom CSS, uploads, embeds,
  federation, messages, migrations, AI output. One risk-bounded slice per
  branch; regression tests must fail before the fix; CodeRabbit (or
  equivalent) review before merge — green CI is necessary but not sufficient.
