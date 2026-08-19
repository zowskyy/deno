# Working agreement for this project

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

- Current project: `gateway-probe`, a read-only OpenWrt/Linux gateway
  diagnostic tool (bufferbloat/CAKE measurement). See `README.md` and
  `deployment/DEPLOYMENT.md` for what exists.
- Long-term direction: open-source, community-driven (r/openwrt,
  homelab audience first), aimed at eventually supporting supervised
  automatic QoS tuning. See prior planning notes in conversation history
  for the fuller roadmap if picking this back up.
- The real-world four-condition CAKE test (on the user's own router) is
  **deferred, not blocking** — it needs physical access to their home
  network, which isn't always available. Don't reintroduce it as a
  requirement; offer it as an optional next step when the user has Wi-Fi
  access and bandwidth for it.
