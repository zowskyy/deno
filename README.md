# deno

This repository contains **two unrelated products** that share no code, users, or
runtime dependencies. Each has its own directory, documentation, and audience —
clone for one and ignore the other.

| Product | Directory | Audience |
|---|---|---|
| **Webroom** | [`webroom/`](webroom/) | People who want a personal homepage — make a page, give it a mood, publish it, wander others' corners without a feed or algorithm |
| **gateway-probe** | [`probe/`](probe/), [`tests/`](tests/), [`deployment/`](deployment/) | OpenWrt / Linux gateway operators measuring bufferbloat, CAKE, and link health |

---

## Webroom

**Make your corner of the internet. Wander into someone else's.**

A personal homepage platform — not a feed, not a website builder. Pick a mood,
fill your page with the things that are actually yours, publish at `/@yourname`,
and discover other pages by wandering, tags, and friend links.

**Full documentation:** [`webroom/README.md`](webroom/README.md) · **Product plan:** [`webroom/PLAN.md`](webroom/PLAN.md)

### Quick start

Requires Node.js ≥ 22.5 (for `node:sqlite`).

```sh
cd webroom/app
npm install
npm run build
npm test          # optional — verify the suite
npm run start     # http://localhost:3000
```

For local development with hot reload, use `npm run dev` instead of `build` + `start`.

---

## gateway-probe

Read-only network diagnostic tool for OpenWrt / Linux gateways.

Measures link state, routing, DNS, latency (idle and load-tested), and CAKE
qdisc statistics. Produces a structured JSON report, a deterministic list of
findings, a persisted history, and a local dashboard. **No configuration is
changed automatically** — the probe only observes and recommends. A separate,
explicitly-invoked safety wrapper exists for supervised QoS changes with an
automatic timed rollback (see below); it is never called by the probe itself.

### Quick start

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Auto-discover WAN interface, probe in idle mode
gateway-probe --target 1.1.1.1 --dns-server 1.1.1.1

# Specify everything explicitly, write a report file, and persist to history
gateway-probe \
  --wan-interface eth0.2 \
  --gateway 192.168.12.1 \
  --dns-server 1.1.1.1 \
  --target 1.1.1.1 \
  --mode idle \
  --idle-pings 60 \
  --output report.json \
  --store report.db
```

### Loaded-latency testing

Run concurrent iperf3 and ping to measure bufferbloat:

```sh
# Upload-loaded (requires an iperf3 server on your LAN or cloud)
gateway-probe \
  --mode upload-loaded \
  --iperf-server 192.168.1.100 \
  --duration 30 \
  --target 1.1.1.1 \
  --output upload-loaded.json \
  --store report.db

# Download-loaded
gateway-probe \
  --mode download-loaded \
  --iperf-server 192.168.1.100 \
  --duration 30 \
  --target 1.1.1.1 \
  --output download-loaded.json \
  --store report.db
```

#### Before/after comparison

For a rigorous before/after measurement, run one probe in `--mode idle` and
one in a loaded mode, then compare the two reports:

```sh
gateway-probe --mode idle --idle-pings 60 --output idle.json
gateway-probe --mode upload-loaded --iperf-server 192.168.1.100 --duration 30 --output loaded.json

gateway-probe-compare idle.json loaded.json
```

```text
Upload queue delay:
165 ms loaded (baseline 15 ms idle)
Delta (queue delay): 150 ms

Interpretation:
Strong evidence of local or near-local bufferbloat; enabling CAKE on
the WAN egress qdisc is recommended.
```

Alternatively, pass `--idle-baseline-p95 <ms>` to a single loaded-mode
`gateway-probe` run to compute `latency.delta_rtt_p95_ms` inline, without a
separate compare step.

### Dashboard and API

Every report can be persisted to a local SQLite event store with `--store`.
Serve that history as a read-only JSON API plus a simple browser dashboard:

```sh
gateway-probe-serve --store report.db --port 8734
# open http://<gateway-ip>:8734/
```

Endpoints (all `GET`, all read-only — no mutating routes exist):

| Endpoint | Returns |
|---|---|
| `/` | Dashboard HTML (auto-refreshes every 5s) |
| `/api/reports` | Recent report summaries, newest first |
| `/api/reports/latest` | Full most-recent report |
| `/api/reports/<id>` | Full report by id |

The API/dashboard process only *reads* the store; it never runs probes
itself and never touches network configuration. Stopping it has no effect
on traffic forwarding or on any in-progress probe.

### Report structure

```
{
  "schema_version": "0.1",
  "timestamp": "...",
  "host":      { "hostname", "platform" },
  "interface": { "name", "carrier", "speed_mbps", "rx_errors", "tx_errors" },
  "routing":   { "default_route_present", "gateway", "routes" },
  "latency":   { "mode", "target", "gateway_p95_ms", "public_p95_ms",
                 "loss_percent", "delta_rtt_p95_ms", "idle_baseline_p95_ms",
                 "load_validation": { "valid_for_wan_comparison", "limitations", ... }, ... },
  "dns":       { "server", "hostname", "success", "p95_ms" },
  "qdisc":     { "cake_detected", "drops", "marks", "backlog_bytes" },
  "findings":  [ { "category", "confidence", "evidence", "interpretation" } ]
}
```

See `schemas/probe-report.schema.json` for the full JSON Schema.

### Diagnostic classifier

Every report includes a `findings` list of deterministic rule-based
diagnostics — no ML. Findings describe measured evidence, not root-cause
verdicts: each has an `evidence` object (the raw measurements) and an
`interpretation` string (a plain-language explanation of what that evidence
shows). Example categories:

| Category | Meaning |
|---|---|
| `physical_link_unavailable` | No carrier on WAN interface |
| `default_route_missing` | No default route (DHCP failure) |
| `next_hop_probe_failed` | Gateway did not respond to ping |
| `dns_resolution_failed` | DNS resolution failed |
| `public_path_probe_failed` | Public target unreachable, gateway OK |
| `full_connectivity_loss` | Both gateway and public target unreachable |
| `latency_increased_with_cake_not_detected` | High loaded RTT under confirmed load, CAKE not detected |
| `latency_increased_while_cake_traffic_observed` | High loaded RTT under confirmed load despite CAKE |
| `packet_loss_observed` | Loss > 5% |
| `cake_aqm_events_observed` | CAKE drop/mark counters are high |

Loaded-mode findings only fire when `latency.load_validation.valid_for_wan_comparison`
is `true` — i.e. iperf3 actually reported throughput above the validity
threshold (`--min-valid-throughput`, default 5 Mb/s). If the load never
materialized (LAN-only iperf3 server, failed transfer, link genuinely under
5 Mb/s), the reason is recorded in `load_validation.limitations` and no
bufferbloat finding is emitted.

### Device inventory ("what's on my network")

A second, separate tool: lists devices currently visible on the local
network (from the ARP/neighbor table — the same thing your router already
tracks internally) and says, in plain language, what's connected and
whether anything is new since the last scan.

```sh
gateway-probe-devices --store devices.db
```

```
You have 9 devices connected: 2 Apple, 1 Samsung, 1 Sonos, 3 private/randomized,
2 unknown vendor. 1 device new since last scan.
```

Read-only and local-only, same as the rest of this project: vendor names
come from a small bundled table (`probe/oui_vendors.py`), not a live/cloud
lookup. Devices using a randomized "private" MAC address (most modern
phones, for privacy) are correctly reported as `randomized_private` rather
than guessed at — this is detected via the real IEEE 802 locally-administered
address bit, not a heuristic. Without `--store`, it just shows the current
snapshot; with it, repeated runs against the same file build a baseline and
flag genuinely new devices.

Run it on a schedule (`deployment/systemd/gateway-probe-devices.{service,timer}`
on Linux, cron on OpenWrt — see `deployment/DEPLOYMENT.md`) and it builds an
activity timeline, not just a snapshot: a device joining for the first time,
a known device going quiet, or a known device coming back are each recorded
once, as they happen — not repeated every scan a device stays away. View it
on the same local dashboard as the health reports (`gateway-probe-serve
--device-store devices.db`), under "Devices on your network" and "Recent
activity."

This is intentionally a separate, small primitive rather than a bundled
"do everything" feature — see `git log` on `probe/devices*.py` for the
scoping rationale. See `schemas/device-report.schema.json` for the full
JSON Schema.

### QoS safety wrapper (opt-in, standalone)

`probe/safety.py` implements the timed-rollback pattern for applying a new
SQM/CAKE configuration. This is the only part of gateway-probe that can
change router state, so every step is designed to report what actually
happened, not just what was attempted:

1. Save the current UCI `sqm` config. **Aborts here** — never touching the
   new config at all — if the save itself fails, since there's no safe way
   to try an untested config without a verified way back.
2. Apply the proposed config.
3. Check gateway reachability (a ping success with heavy packet loss,
   e.g. 80%, does **not** count as reachable — see
   `MAX_ACCEPTABLE_LOSS_PERCENT`); roll back immediately on failure.
4. Check WAN reachability, same standard; roll back immediately on failure.
5. If the config committed to disk but the `sqm` service itself failed to
   restart, that also triggers rollback — a partial failure is never
   silently treated as "nothing happened."
6. Otherwise, arm a timer: if `--confirm-file` is not touched within
   `--confirm-timeout` seconds (minimum 5s, enforced), the old config is
   restored automatically.

Every rollback — immediate or timer-fired — **verifies its own result**.
If restoring the old config also fails, the outcome is reported as
`ROLLBACK FAILED: ... manual intervention required`, distinct from a
successful `rollback: ...` — the tool never claims a router was safely
reverted when the restore attempt actually failed.

```sh
gateway-probe-safety apply \
  --backup /root/sqm-backup.uci \
  --new-config /root/sqm-proposed.uci \
  --gateway 192.168.12.1 \
  --target 1.1.1.1 \
  --confirm-timeout 120 \
  --confirm-file /tmp/gateway-probe-confirm
```

This module is **never imported by `probe.api` or `probe.cli`** — it runs as
its own process on purpose, so the rollback watchdog keeps working even if
the dashboard crashes. All I/O (config save/apply, reachability checks) is
injectable, which is how `tests/test_safety.py` verifies the rollback and
confirmation logic without touching real `uci` or the network — including
a forced-interleaving test that proves `confirm()` and the timer's own
rollback can never race each other into reporting the wrong outcome.

### Repository layout

```
├── probe/
│   ├── __init__.py
│   ├── cli.py             # argparse entry point (gateway-probe)
│   ├── discovery.py       # auto-detect WAN interface
│   ├── interfaces.py      # link state
│   ├── routes.py          # routing table
│   ├── dns.py             # DNS probes
│   ├── latency.py         # ping + iperf3
│   ├── qdisc.py           # CAKE / tc stats
│   ├── classifier.py      # deterministic findings
│   ├── report.py          # assembles everything into one report
│   ├── store.py           # SQLite event store (gateway-probe --store)
│   ├── config.py          # TOML config loading
│   ├── api.py             # read-only HTTP API + dashboard (gateway-probe-serve)
│   ├── compare.py         # idle-vs-loaded delta tool (gateway-probe-compare)
│   ├── safety.py          # QoS timed-rollback wrapper (gateway-probe-safety)
│   ├── shell.py           # subprocess helper that never crashes on missing tools
│   ├── devices.py         # ARP/neighbor-table parsing + MAC classification
│   ├── device_history.py  # SQLite baseline for new-device detection
│   ├── devices_report.py  # plain-language device report
│   ├── devices_cli.py     # argparse entry point (gateway-probe-devices)
│   ├── oui_vendors.py     # small bundled MAC-vendor lookup table
│   └── static/
│       └── dashboard.html
├── schemas/
│   ├── probe-report.schema.json
│   └── device-report.schema.json
├── tests/
│   ├── test_classification.py
│   ├── test_compare.py
│   ├── test_config.py
│   ├── test_store.py
│   ├── test_api.py
│   ├── test_safety.py
│   ├── test_shell.py
│   ├── test_latency.py
│   ├── test_qdisc.py
│   ├── test_cli.py
│   ├── test_devices.py
│   ├── test_device_history.py
│   ├── test_devices_report.py
│   ├── test_devices_cli.py
│   └── fixtures/
│       └── sample_report.json
├── deployment/            # install guides, systemd/procd units, test scripts
├── reports/               # default place to keep ad-hoc report.json / report.db files
└── pyproject.toml
```

### Running tests

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

(A venv avoids the "externally-managed-environment" error `pip install`
raises directly on Debian 12+ / Ubuntu 24.04+ and newer distros, per
[PEP 668](https://peps.python.org/pep-0668/).)

### Phase 1 acceptance criteria

- [x] Measures link state and default-route state
- [x] Measures gateway and public latency
- [x] Reports DNS success or failure
- [x] Captures CAKE statistics
- [x] Produces JSON reports
- [x] Distinguishes at least four injected failures (link, route, DNS, WAN) —
      see `tests/test_classification.py`
- [x] Demonstrates before/after latency under upload load —
      `gateway-probe-compare` and `--idle-baseline-p95`
- [x] Safely rolls back an invalid QoS configuration —
      `probe/safety.py` + `tests/test_safety.py` (opt-in, never auto-invoked)
- [x] Continues forwarding traffic if the dashboard process stops — the
      dashboard/API (`probe.api`) only reads the store; it never touches
      routing, firewall, or QoS state, and the safety wrapper runs as an
      independent process from the dashboard
- [x] Uses no cloud service — everything is local: stdlib HTTP server,
      SQLite file, and user-chosen ping/iperf3 targets

### Constraints

- **Read-only by default**: the probe (`gateway-probe`) and dashboard
  (`gateway-probe-serve`) never change configuration.
- **QoS changes are opt-in and supervised**: only `gateway-probe-safety`,
  invoked explicitly, can change SQM config, and only with a verified,
  timed rollback.
- **No cloud**: all measurements are local or to user-chosen targets; the
  dashboard is a stdlib `http.server`, the store is a local SQLite file.
- **No ML**: the classifier uses deterministic rules, testable in isolation.

---

## License

MIT — see [`LICENSE`](LICENSE).
