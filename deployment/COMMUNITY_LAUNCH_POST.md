# Community launch post (r/openwrt / OpenWrt forums)

Two platforms below, each with a ready-now version and a results version.
**Post the "ready-now" version first** on whichever platform you pick —
it's honest and has no placeholders. Swap in the "results" version once
the real four-condition case study has actual numbers in it (see
`CASE_STUDY_TEMPLATE.md`); it reads better once there's real proof to
point to, but doesn't have to come first.

The OpenWrt Forum post is the better opening move: it's OpenWrt's own
official community site (not a third party), a new account can post
there right away with no karma/age gate the way Reddit has, and there's
a category built exactly for this.

---

## OpenWrt Forum — post in "Community Builds, Projects & Packages"

Go to **forum.openwrt.org**, create an account (standard signup, no
approval wait), then start a new topic in the **Community Builds,
Projects & Packages** category — that's the section OpenWrt itself
describes as the place to "announce your custom builds, projects and
packages that use/work with OpenWrt."

### Ready now (tester recruitment, no results yet)

**Title:** gateway-probe — a free, read-only bufferbloat/CAKE diagnostic
tool for OpenWrt (looking for testers)

Most of us have heard "just enable CAKE, it fixes bufferbloat" more times
than we've actually measured our *own* connection before and after to
confirm it, by how much, or whether the SQM bandwidth limit we picked is
even close to right.

I built **gateway-probe** to answer that for my own gateway, and I'm
opening it up here before I publish results, because a handful of
different ISPs and router models will produce a much more useful first
data set than just mine.

**What it does:** a small, read-only diagnostic tool for OpenWrt and
Linux gateways. It measures link state, default route, DNS resolution,
gateway and public-internet latency — both idle and under real load via
iperf3 — and CAKE qdisc statistics (drops, marks, backlog), then reports
findings in plain language rather than a wall of numbers:

```
$ gateway-probe --mode upload-loaded --iperf-server 203.0.113.10
[gateway-probe] 1 finding(s):
  [85%] bufferbloat: significant queue delay despite CAKE being active;
        consider lowering the CAKE bandwidth limit closer to actual line rate.
```

It keeps a local history (SQLite) and ships an optional local dashboard
(`gateway-probe-serve`) so you can check it from your phone on your own
LAN — nothing here leaves your network.

**Design choices, and why:**

- **Read-only by default.** The probe itself never touches your
  configuration — measure and report only.
- **No telemetry, ever — not even opt-in.** No account, no cloud
  service, no anonymized usage collection. Everything stays local to
  your gateway; that's a permanent design decision, not a v1 gap.
- **MIT licensed**, source included.
- **The one thing it *can* change (SQM config) is a separate, opt-in
  tool** — `gateway-probe-safety` — invoked explicitly, never by the
  probe itself. It verifies the change didn't break your connection and
  auto-reverts on failure or if you don't confirm within a timeout.

**Where I'm at:** the tool has 285 automated tests, including
adversarial ones — corrupt config files, dropped SSH sessions mid-test,
missing dependencies, bad install paths — because I'd rather it fail
honestly and tell you exactly what went wrong than crash or silently
give a bad answer. I'm about to run the full four-condition before/after
test (SQM off/on × idle/loaded) on my own connection and publish the raw
reports. Looking for testers on other ISPs (cable, fiber, DSL,
cellular/fixed-wireless, Starlink especially) and other router hardware
to run it alongside me — and to tell me what's confusing or what breaks.

Repo + install docs (systemd/Linux and OpenWrt procd, both covered):
**https://github.com/zowskyy/deno**

Happy to go into the classifier logic, the safety-wrapper rollback
design, or any of the specific calls above — ask away.

### Results version (swap in once the case study has real numbers)

Replace the "Where I'm at" paragraph with:

**The proof, not just the pitch:** I ran the full four-condition test
(SQM off/on × idle/loaded) on my own [ISP] connection through OpenWrt.
Full raw reports and methodology are linked below, but the short version:
loaded latency went from **[X] ms** added delay with SQM off to **[Y] ms**
with CAKE enabled — a **[Z]%** reduction.

---

## r/openwrt (Reddit) — second, once you have some forum activity

A brand-new Reddit account posting a link often gets silently filtered
by the subreddit's spam protection. Comment normally there for a few
days first, or just lead with the OpenWrt Forum above and come back to
Reddit once your account has a little history.

### Ready now (tester recruitment, no results yet)

**Title:** I built a free, read-only tool that measures bufferbloat on
your OpenWrt gateway — looking for testers before I publish real
before/after numbers

Most of us have heard "just enable CAKE, it fixes bufferbloat" a hundred
times. Fewer of us have actually measured *our own* connection before and
after to know if it did anything, by how much, or whether the SQM
bandwidth limit we picked is even close to right.

I got tired of guessing, so I built **gateway-probe** — a small, read-only
diagnostic tool for OpenWrt and Linux gateways that measures your actual
link, routing, DNS, and latency (idle vs. under real load via iperf3), and
tells you in plain language what's going on. No dashboard full of numbers
you have to interpret yourself — it says things like "your connection has
significant bufferbloat; enabling CAKE is recommended" or "CAKE is active
but your bandwidth limit looks too high for what you're actually getting."

**A few things that matter to me, so they're built in from the start:**

- **Read-only by default.** The probe never touches your configuration.
  It only ever measures and reports.
- **Nothing leaves your network.** No account, no cloud service, no
  telemetry, no anonymized usage data — not even opt-in. Everything stays
  on your own gateway.
- **Free and open source.** MIT licensed. Fork it, read it, change it.
- **The one thing it *can* change is opt-in and supervised.** There's a
  separate `gateway-probe-safety` tool for actually applying a new SQM
  config, and it only runs if you invoke it yourself — it verifies the
  change didn't break your connection and automatically reverts if it
  did, or if you don't confirm within a timeout window.

**What it actually measures:** link state, default route, DNS resolution,
gateway and public-internet latency (idle and under upload/download load),
CAKE qdisc statistics (drops, marks, backlog), and it keeps a local
history so you can see trends over time. There's also a local dashboard
(`gateway-probe-serve`) if you want to check it from your phone on your
own LAN — still nothing leaves your network, it just serves what's
already stored locally.

**Where I'm at:** the tool itself is built and tested — 285 automated
tests, including deliberately adversarial ones (corrupt config files,
dropped SSH sessions mid-test, missing dependencies, bad install paths).
I'd rather it fail honestly and tell you exactly what went wrong than
crash or quietly give you a bad answer. I'm about to run the full
four-condition before/after test (SQM off/on × idle/loaded) on my own
connection and publish the raw numbers. Before I do, I wanted to open
this up — if a few people on different ISPs and router hardware run it
alongside me, we end up with a real first data set instead of just my
one connection.

**What I'm looking for:** a handful of testers on different ISPs (cable,
fiber, DSL, cellular/fixed-wireless, Starlink — the weirder the better)
and different router hardware, willing to install it, run it, and tell
me what breaks or what's confusing. It's early — I'd rather hear about
rough edges now than have people quietly bounce off them.

Repo + install docs (both systemd/Linux and OpenWrt procd):
**https://github.com/zowskyy/deno**

Happy to answer questions about the methodology, the classifier logic, or
why I made specific design calls (like keeping it read-only by default).

---

### Results version (swap in once the case study has real numbers)

**Title:** I built a free, read-only tool that measures bufferbloat on your
OpenWrt gateway and tells you plainly what's wrong — no cloud, no account,
no telemetry

*(Same opening and bullet points as the ready-now version above, but
replace the "Where I'm at" paragraph with:)*

**The proof, not just the pitch:** I ran the full four-condition test
(SQM off/on × idle/loaded) on my own [ISP] connection through OpenWrt.
Full raw reports and methodology are in the case study, but the short
version: loaded latency went from **[X] ms** added delay with SQM off to
**[Y] ms** with CAKE enabled — a **[Z]%** reduction. That's the difference
between a video call stuttering under a large upload and not noticing it
happened.

Repo, install docs, and the full case study:
**https://github.com/zowskyy/deno**
