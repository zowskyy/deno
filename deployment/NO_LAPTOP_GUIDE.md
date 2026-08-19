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

## 5. Get the code onto the router

No laptop, no `git clone` step — just pull the code directly onto the
router from GitHub:

```sh
mkdir -p /tmp/gateway-probe && cd /tmp/gateway-probe
wget -O src.tar.gz https://github.com/zowskyy/deno/archive/refs/heads/claude/gateway-probe-mvp-ueca5r.tar.gz
tar xzf src.tar.gz --strip-components=1
ls probe/   # should list cli.py, latency.py, classifier.py, etc.
```

(If the repo is private, `wget` will fail with a 404 — in that case, ask
whoever has access to send you the `gateway-probe-complete.zip` directly
to your phone, then push it to the router with Termux's `scp` instead of
downloading from GitHub.)

## 6. Run the test — entirely from this one SSH session

This is the key difference from a laptop-based setup: **the router plays
both roles**. It runs the probe *and* generates the iperf3 load itself —
no separate "wired LAN client" device required. CAKE shapes the WAN
egress queue regardless of where the traffic originates, so this still
validly tests bufferbloat.

```sh
cd /tmp/gateway-probe
mkdir -p results && cd results

# Find an external iperf3 server, e.g. iperf3.speedtest.fr

# --- SQM OFF ---
uci set sqm.@default[0].enabled=0
uci commit sqm
/etc/init.d/sqm stop

python3 -m probe.cli --mode idle --target 1.1.1.1 --output sqm-off-idle-1.json
python3 -m probe.cli --mode upload-loaded --target 1.1.1.1 \
  --iperf-server iperf3.speedtest.fr --duration 30 \
  --output sqm-off-upload-loaded-1.json

# --- SQM ON ---
uci set sqm.@default[0].enabled=1
uci commit sqm
/etc/init.d/sqm start
sleep 10

python3 -m probe.cli --mode idle --target 1.1.1.1 --output sqm-on-idle-1.json
python3 -m probe.cli --mode upload-loaded --target 1.1.1.1 \
  --iperf-server iperf3.speedtest.fr --duration 30 \
  --output sqm-on-upload-loaded-1.json
```

Repeat the off/on pair two more times (per the alternating protocol in
`FOUR_CONDITION_TEST_GUIDE.md`) for `-2` and `-3` suffixes.

## 7. Read the results — no file transfer needed

You don't need to move JSON files anywhere. Read the key numbers straight
out of the SSH session with a one-liner:

```sh
for f in *.json; do
  echo "$f:"
  python3 -c "
import json
d = json.load(open('$f'))
lat = d['latency']
print('  public_p95_ms:', lat.get('public_p95_ms'))
print('  throughput_mbps:', lat.get('loaded_throughput_mbps'))
print('  valid_for_wan_comparison:', lat.get('load_validation', {}).get('valid_for_wan_comparison'))
"
done
```

Jot the numbers into your phone's notes app as you go — that's your raw
data for the case study table. No laptop, no file transfer, no USB cable.

## 8. Fill in the case study

Once you have all 12 numbers, open `deployment/CASE_STUDY_TEMPLATE.md`
(view it on GitHub from your phone browser, or `cat` it over SSH) and fill
in the result table from your notes. Everything else — equipment specs,
topology — you already know from steps 1-4.

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
