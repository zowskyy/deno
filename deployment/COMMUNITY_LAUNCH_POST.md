# Community launch post (r/openwrt / OpenWrt forums)

Ready to post once the first real case study (see `CASE_STUDY_TEMPLATE.md`)
has actual numbers filled in — replace the `[bracketed]` placeholders below
with that data before posting. Everything else is ready as-is.

---

**Title:** I built a free, read-only tool that measures bufferbloat on your
OpenWrt gateway and tells you plainly what's wrong — no cloud, no account,
no telemetry

Most of us have heard "enable CAKE, it fixes bufferbloat" a hundred times.
Fewer of us have actually measured *our own* connection before and after
to know if it did anything, by how much, or whether our SQM bandwidth
limit is even close to right.

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

**The proof, not just the pitch:** I ran the full four-condition test
(SQM off/on × idle/loaded) on my own [ISP] connection through OpenWrt.
Full raw reports and methodology are in the case study, but the short
version: loaded latency went from **[X] ms** added delay with SQM off to
**[Y] ms** with CAKE enabled — a **[Z]%** reduction. That's the difference
between a video call stuttering under a large upload and not noticing it
happened.

**What I'm looking for:** a handful of people running different ISPs
(cable, fiber, DSL, cellular/fixed-wireless, Starlink — the weirder the
better) and different router hardware, willing to install it, run it,
and tell me what breaks or what's confusing. It's early — I'd rather hear
about rough edges now than have people quietly bounce off them.

Repo, install docs (both systemd/Linux and OpenWrt procd), and the full
case study: **[repo link]**

Happy to answer questions about the methodology, the classifier logic, or
why I made specific design calls (like keeping it read-only by default).
