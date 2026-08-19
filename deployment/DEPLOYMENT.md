# gateway-probe Deployment Guide

Read-only network diagnostics for OpenWrt and Linux gateways. Measures link state, routing, DNS, latency under load, and CAKE qdisc statistics.

## Deployment Overview

gateway-probe ships with two supported installation paths: **Linux (systemd)** and **OpenWrt (procd)**.

- **Linux**: Debian 12+ / Ubuntu 24.04+ on x86_64
- **OpenWrt**: Version 23.05.x LTS and 24.x on tested hardware (see below)

All probe runs are read-only. The separate `gateway-probe-safety` wrapper exists for supervised QoS changes with automatic timed rollback (opt-in, never auto-invoked).

## Linux Deployment

### Install

```bash
# Clone or extract the repository
git clone https://github.com/zowskyy/gateway-probe.git
cd gateway-probe

# Create service user
sudo useradd -r -s /usr/sbin/nologin gateway-probe

# Install Python package
sudo pip install -e .

# Install systemd service files
sudo cp deployment/systemd/* /etc/systemd/system/
sudo mkdir -p /etc/gateway-probe /var/lib/gateway-probe
sudo touch /etc/gateway-probe/config.toml
sudo chown -R gateway-probe:gateway-probe /var/lib/gateway-probe /etc/gateway-probe

# Load and enable service
sudo systemctl daemon-reload
sudo systemctl enable gateway-probe.timer
sudo systemctl start gateway-probe.timer
```

### Configuration

Edit `/etc/gateway-probe/config.toml`:

```toml
[probe]
# Target IP for WAN reachability tests
target = "1.1.1.1"

# DNS server for resolution tests
dns_server = "1.1.1.1"

# WAN interface (auto-discover from default route if unset)
wan_interface = ""

# Gateway IP (auto-discover from default route if unset)
gateway = ""

[latency]
# Load test iperf3 server (required for upload/download-loaded modes)
iperf_server = ""

[retention]
# Maximum database size in MB
max_database_mb = 100

# Maximum number of stored reports
max_report_count = 10000

# Keep full reports for this many days (older ones are aggregated into
# daily summaries and the originals deleted)
full_report_days = 30

# Keep daily summaries for this many days
daily_summary_days = 180

# Run compaction when database fragmentation exceeds this percent
vacuum_threshold_percent = 25

[api]
# Bind address for dashboard (127.0.0.1 by default, never expose to WAN)
bind_address = "127.0.0.1"
port = 8734
```

### Service units

`gateway-probe.service` runs a single idle probe.
`gateway-probe.timer` schedules probes every 15 minutes.

To run manually:

```bash
systemctl start gateway-probe.service
journalctl -u gateway-probe -f
```

To view the dashboard:

```bash
systemctl start gateway-probe-api.service
# open http://127.0.0.1:8734/
```

## OpenWrt Deployment

### Supported Hardware

| Router Model | OpenWrt Version | Status | Notes |
|---|---|---|---|
| Archer AX6000 | 24.x | Tested | 4 GB RAM, dual-core |
| TP-Link VDSL/VDSL2 | 23.05 | Tested | Limited to idle mode |
| Generic x86_64 VM | 24.x | Tested | Lab validation |

### Prerequisites

- OpenWrt 23.05 LTS or 24.x
- Python 3.11+ (install via `opkg install python3-minimal python3-pip`)
- At least 150 MB free space in `/overlay` (database + scripts)
- Wired LAN client for loaded tests (if using iperf3)

### Install

```bash
# SSH to router
ssh root@192.168.1.1

# Add Python packages
opkg update
opkg install python3-minimal python3-pip ca-bundle

# Install gateway-probe
pip install gateway-probe

# Create directories
mkdir -p /etc/config /overlay/gateway-probe
chmod 755 /overlay/gateway-probe

# Copy init script
cp /path/to/deployment/openwrt/gateway-probe /etc/init.d/
chmod +x /etc/init.d/gateway-probe

# Enable and start
/etc/init.d/gateway-probe enable
/etc/init.d/gateway-probe start
```

### Configuration

The OpenWrt `/etc/init.d/gateway-probe` script manages only the dashboard
daemon (`gateway-probe-serve`) and reads its bind address/port from UCI.
Create `/etc/config/gateway-probe`:

```
config gateway_probe
  option bind_address '192.168.1.1'
  option port '8734'
```

`bind_address` defaults to `127.0.0.1` (LAN devices won't be able to reach
it) if omitted; set it to the router's LAN IP for LAN-wide dashboard
access. Probe settings (target, DNS server, iperf3 server, retention) are
separate — they go in a TOML file passed to `gateway-probe --config`, same
as the Linux deployment; see the example above and schedule it with cron
(OpenWrt's `procd` init scripts are best suited to long-running daemons
like the dashboard, not short periodic jobs).

### Daemon operation

The service runs as a procd-managed daemon:

```bash
# View status
/etc/init.d/gateway-probe status

# View logs
logread -f | grep gateway-probe

# Reload after config changes
/etc/init.d/gateway-probe reload

# Stop
/etc/init.d/gateway-probe stop
```

Access the dashboard from a LAN device:

```bash
# From Linux laptop on LAN
curl http://192.168.1.1:8734/api/reports

# From browser
# http://192.168.1.1:8734/
```

## Storage and Retention

Both deployments use SQLite with configurable retention. Retention runs as
part of `gateway-probe --store ...` (the writer process) after each report
is saved — never from `gateway-probe-serve`, which only ever opens the
store read-only and could be running under a read-only mount. The policy:

1. Aggregates full reports older than `full_report_days` into one
   daily-summary row per day (report count, average finding count, most
   common finding category), then deletes the originals.
2. Deletes summary rows older than `daily_summary_days`.
3. If more than `max_report_count` full reports remain, deletes the oldest
   down to that limit.
4. If the database file still exceeds `max_database_mb`, deletes the oldest
   full reports in batches (never below the last 5 reports).
5. Compacts the database (`VACUUM`) if free-page fragmentation exceeds
   `vacuum_threshold_percent`.

Monitor storage via the dashboard `/api/reports` endpoint:

```json
{
  "storage": {
    "database_bytes": 18432000,
    "free_bytes": 71245824,
    "oldest_full_report": "2026-07-19T00:00:00Z",
    "retention_status": "healthy"
  },
  "reports": [ /* recent report summaries, newest first */ ]
}
```

`retention_status` is `low_space` when free disk space drops below 2x the
current database size — a signal to lower `max_database_mb` or
`full_report_days`, not something the tool reacts to automatically.

## QoS Configuration and Safety

To apply a new CAKE/SQM configuration with automatic rollback:

```bash
# Save current configuration
uci export sqm > /tmp/old-sqm.uci

# Create new configuration
# (your SQM/CAKE setup script here)
uci export sqm > /tmp/new-sqm.uci

# Apply with timed rollback (120-second confirmation window)
gateway-probe-safety apply \
  --backup /tmp/old-sqm.uci \
  --new-config /tmp/new-sqm.uci \
  --gateway 192.168.1.1 \
  --target 1.1.1.1 \
  --confirm-timeout 120 \
  --confirm-file /tmp/confirm-sqm

# To keep the new config, touch the confirmation file before timeout
touch /tmp/confirm-sqm
```

The safety wrapper is **opt-in and never auto-invoked**. The probe itself remains read-only.

## Verification Checklist

Before pilot deployment:

- [ ] Fresh install succeeds (systemd or procd)
- [ ] Service starts after reboot
- [ ] Probe can write to persistent storage
- [ ] Missing optional utilities (iperf3, tc) yield partial but valid reports
- [ ] Removing the package leaves no firewall, route, SQM, or UCI changes
- [ ] API binds to localhost only (Linux) or gateway LAN IP (OpenWrt)
- [ ] Dashboard auto-refreshes every 5 seconds
- [ ] Stopping the API/dashboard does not affect probe execution or traffic forwarding

## Troubleshooting

### Probes not running (systemd)

```bash
systemctl status gateway-probe.timer
systemctl status gateway-probe.service
journalctl -u gateway-probe -n 50
```

### High CPU or storage growth

Check configuration:

```bash
cat /etc/gateway-probe/config.toml
sqlite3 /var/lib/gateway-probe/reports.db ".tables"
sqlite3 /var/lib/gateway-probe/reports.db "SELECT COUNT(*) FROM reports;"
```

Retention runs automatically every time `gateway-probe --store ...` saves a
report — there is no separate compaction command. To trigger it on demand,
just run a probe with the same `--store` file:

```bash
gateway-probe --config /etc/gateway-probe/config.toml --store /var/lib/gateway-probe/reports.db
```

### Missing utilities on OpenWrt

If `ip`, `ping`, `dig`, or `tc` are unavailable, the tool produces a valid report with findings describing what is unavailable. This is intentional graceful degradation, not an error.

To add missing utilities:

```bash
opkg install iputils-ping bind-dig iproute2 tc
```

## Uninstall

### Linux

```bash
systemctl stop gateway-probe.timer
systemctl disable gateway-probe.timer
sudo rm /etc/systemd/system/gateway-probe*
sudo pip uninstall gateway-probe
sudo userdel gateway-probe
sudo rm -rf /etc/gateway-probe /var/lib/gateway-probe
```

### OpenWrt

```bash
/etc/init.d/gateway-probe stop
/etc/init.d/gateway-probe disable
rm /etc/init.d/gateway-probe
pip uninstall gateway-probe
rm -rf /etc/config/gateway-probe /overlay/gateway-probe
```

## References

- OpenWrt Init System (procd): https://openwrt.org/docs/guide-user/basics/services/init_scripts
- Linux systemd service units: https://www.freedesktop.org/software/systemd/man/systemd.service.html
- SQLite retention and VACUUM: https://www.sqlite.org/lang_vacuum.html
