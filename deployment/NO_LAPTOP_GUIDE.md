# Running the Four-Condition Test With Just Your Phone

No laptop needed. gateway-probe has zero external dependencies (pure
Python stdlib) — you can copy the code straight onto the router and run
both the probe *and* the iperf3 load generator from the same SSH session,
all from a phone.

## What you need

- A phone or tablet (Android or iOS)
- An SSH app
- Your OpenWrt router's admin/SSH credentials

## 1. Get an SSH app

**Android**: [Termux](https://f-droid.org/en/packages/com.termux/) (install
from F-Droid, not the outdated Play Store version). Free, no account needed.

**iOS**: [Termius](https://termius.com/) (free tier is enough) or
[Blink Shell](https://blink.sh/).

## 2. Find your router's IP

- **Android**: Settings → Wi-Fi → tap your network → Advanced/IP details → look for "Gateway"
- **iOS**: Settings → Wi-Fi → tap the (i) next to your network → look for "Router"

It's usually `192.168.1.1` on most OpenWrt setups.

## 3. SSH into the router

```sh
ssh root@192.168.1.1
```

## 4. Check free space and install what you need

```sh
df -h /overlay
opkg update
opkg install python3-base iperf3
python3 --version
```

If space is tight, `python3-base` (no pip/dev headers) is enough — the
probe never calls out to pip or any third-party package.

## 5. Run the test — one script, one paste

No separate "get the code" step needed — the script below fetches the
probe source itself if it isn't already on the router. Use
`deployment/run-four-condition-test.sh`: it installs `python3`/`iperf3` if
missing, fetches the probe source, runs all 3 iterations of SQM off/on ×
idle/loaded automatically (toggling SQM and waiting for it to settle
between conditions), and prints a summary table with medians and the CAKE
improvement delta at the end.

This is the same "router plays both roles" approach: it runs the probe
*and* generates the iperf3 load itself, no separate wired LAN client
needed. CAKE shapes the WAN egress queue regardless of where the traffic
originates, so this still validly tests bufferbloat.

```sh
wget -O run-test.sh https://raw.githubusercontent.com/zowskyy/deno/claude/gateway-probe-mvp-ueca5r/deployment/run-four-condition-test.sh
IPERF_SERVER=iperf3.example.com sh run-test.sh
```

Replace `iperf3.example.com` with a real WAN-reachable iperf3 server. If
the repo is private, `wget` will 404 — in that case copy the script's
contents into a file on the router with `vi`/`nano`, or push it over with
Termux's `scp` instead.

The whole run takes roughly `iterations × (2 × 30s ping/settle overhead + 2 × 30s loaded test)` —
about 6-7 minutes for the default 3 iterations at the default 30s duration.
Adjust with env vars if you want it shorter for a first sanity check:

```sh
IPERF_SERVER=iperf3.example.com ITERATIONS=1 DURATION=10 sh run-test.sh
```

At the end you'll see something like:

```
=== Medians (loaded runs only counted if valid_for_wan_comparison) ===
SQM off, idle  : median 18.4 ms (n=3)
SQM off, loaded: median 163.7 ms (n=3)
SQM on,  idle  : median 19.2 ms (n=3)
SQM on,  loaded: median 42.1 ms (n=3)

SQM OFF added latency under load: 145.3 ms
SQM ON  added latency under load: 22.9 ms

>>> CAKE improvement: 122.4 ms less added latency <<<
```

That's your headline number for the case study, computed automatically —
no manual JSON parsing, no file transfer, no laptop.

## 6. Fill in the case study

Once you have the summary table, open `deployment/CASE_STUDY_TEMPLATE.md`
(view it on GitHub from your phone browser, or `cat` it over SSH) and fill
in the result table with the numbers the script printed. Everything else —
equipment specs, topology — you already know from steps 1-4.

## Caveat to note in your case study

Running iperf3 *on* the router adds the router's own CPU load to both
sides of the test (generating traffic, shaping it, and pinging
concurrently). On a low-power router this can add a small amount of
latency that isn't purely queue-induced — it's worth naming your router's
CPU/RAM in the case study and flagging this as a limitation, same as the
"one gateway, one test period" caveats already in the template.

## Cleanup

```sh
rm -rf /tmp/gateway-probe
```

Nothing was installed outside `/tmp` and `opkg` packages — no lasting
changes to the router beyond `python3-base`/`iperf3` (which you can remove
with `opkg remove python3-base iperf3` if you want the space back).
