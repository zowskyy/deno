# gateway-probe

Read-only network diagnostic tool for OpenWrt / Linux gateways.

Measures link state, routing, DNS, latency (idle and load-tested), and CAKE
qdisc statistics. Produces a structured JSON report and a deterministic list
of findings. **No configuration is changed automatically.**

## Quick start

```sh
pip install -e ".[dev]"

# Auto-discover WAN interface, probe in idle mode
gateway-probe --target 1.1.1.1 --dns-server 1.1.1.1

# Specify everything explicitly and write a report file
gateway-probe \
  --wan-interface eth0.2 \
  --gateway 192.168.12.1 \
  --dns-server 1.1.1.1 \
  --target 1.1.1.1 \
  --mode idle \
  --idle-pings 60 \
  --output report.json
```

## Loaded-latency testing

Run concurrent iperf3 and ping to measure bufferbloat:

```sh
# Upload-loaded (requires an iperf3 server on your LAN or cloud)
gateway-probe \
  --mode upload-loaded \
  --iperf-server 192.168.1.100 \
  --duration 30 \
  --target 1.1.1.1 \
  --output upload-loaded.json

# Download-loaded
gateway-probe \
  --mode download-loaded \
  --iperf-server 192.168.1.100 \
  --duration 30 \
  --target 1.1.1.1 \
  --output download-loaded.json
```

The `delta_rtt_p95_ms` field in the latency section shows queue delay induced
by the traffic. A large delta (>50 ms) indicates bufferbloat.

## Report structure

```
{
  "schema_version": "0.1",
  "timestamp": "...",
  "host":      { "hostname", "platform" },
  "interface": { "name", "carrier", "speed_mbps", "rx_errors", "tx_errors" },
  "routing":   { "default_route_present", "gateway", "routes" },
  "latency":   { "mode", "target", "gateway_p95_ms", "public_p95_ms",
                 "loss_percent", "delta_rtt_p95_ms", ... },
  "dns":       { "server", "hostname", "success", "p95_ms" },
  "qdisc":     { "cake_detected", "drops", "marks", "backlog_bytes" },
  "findings":  [ { "category", "confidence", "reason" } ]
}
```

See `schemas/probe-report.schema.json` for the full JSON Schema.

## Diagnostic classifier

Every report includes a `findings` list of deterministic rule-based
diagnostics. Example categories:

| Category | Meaning |
|---|---|
| `physical_link` | No carrier on WAN interface |
| `address_configuration` | No default route (DHCP failure) |
| `gateway_or_local_network` | Gateway did not respond to ping |
| `dns` | DNS resolution failed |
| `wan_or_upstream` | Public target unreachable, gateway OK |
| `full_connectivity_loss` | Both gateway and public target unreachable |
| `bufferbloat_no_cake` | High loaded RTT, CAKE not detected |
| `bufferbloat_with_cake` | High loaded RTT despite CAKE |
| `packet_loss` | Loss > 5% |
| `cake_drops` | CAKE drop counter is high |

## Repository layout

```
gateway-probe/
├── probe/
│   ├── __init__.py
│   ├── cli.py          # argparse entry point
│   ├── discovery.py    # auto-detect WAN interface
│   ├── interfaces.py   # link state
│   ├── routes.py       # routing table
│   ├── dns.py          # DNS probes
│   ├── latency.py      # ping + iperf3
│   ├── qdisc.py        # CAKE / tc stats
│   ├── classifier.py   # deterministic findings
│   └── report.py       # assembles everything
├── schemas/
│   └── probe-report.schema.json
├── tests/
│   ├── test_classification.py
│   └── fixtures/
│       └── sample_report.json
└── pyproject.toml
```

## Running tests

```sh
pip install -e ".[dev]"
pytest
```

## Phase 1 acceptance criteria

- [x] Measures link state and default-route state
- [x] Measures gateway and public latency
- [x] Reports DNS success or failure
- [x] Captures CAKE statistics
- [x] Produces JSON reports
- [x] Distinguishes at least four injected failures (link, route, DNS, WAN)
- [x] Demonstrates before/after latency under upload load via `delta_rtt_p95_ms`
- [ ] Safe rollback for QoS changes (Phase 2 — tool is read-only in Phase 1)
- [x] Continues forwarding traffic if probe stops (probe is read-only; no daemon required)
- [x] Uses no cloud service

## Constraints

- **Read-only**: Phase 1 makes no configuration changes.
- **No cloud**: all measurements are local or to user-chosen targets.
- **No ML**: the classifier uses deterministic rules, testable in isolation.
