# Four-Condition CAKE Test: Step-by-Step Guide

## Prerequisites

Before you start, make sure you have:

- **gateway-probe installed** on your OpenWrt gateway
  ```bash
  pip install -e /path/to/gateway-probe  # or git clone + install
  ```

- **iperf3 server accessible** (external, WAN-reachable)
  - You can use a public iperf3 server or your own VPS
  - Example: `iperf3.speedtest.fr` or your cloud provider
  - Make sure you know the IP/hostname

- **iperf3 client installed** on a wired device on your LAN
  ```bash
  # On Linux/Mac
  brew install iperf3  # or apt install iperf3
  
  # On OpenWrt (if testing from gateway itself)
  opkg install iperf3
  ```

- **Quiet network** (minimal background traffic during tests)
  - Close streaming, downloads, other devices
  - Run tests during off-peak hours if possible

- **Directory to store reports**
  ```bash
  mkdir -p ~/gateway-probe-tests
  cd ~/gateway-probe-tests
  ```

---

## Test Protocol: Alternating Conditions

Run each condition **3 times** in alternating order to minimize time-of-day effects.

```
Test 1: SQM off, idle
Test 2: SQM off, upload-loaded
Test 3: SQM on, idle
Test 4: SQM on, upload-loaded
Test 5: SQM off, idle
Test 6: SQM off, upload-loaded
Test 7: SQM on, idle
Test 8: SQM on, upload-loaded
Test 9: SQM off, idle
Test 10: SQM off, upload-loaded
Test 11: SQM on, idle
Test 12: SQM on, upload-loaded
```

**Total time**: ~1 hour (12 tests × 5 min each, plus reconfiguration time)

---

## Step 1: Verify Baseline Configuration

SSH into your gateway:
```bash
ssh root@192.168.1.1
```

Check current SQM/CAKE status:
```bash
# View SQM config
uci show sqm

# Check if CAKE is currently enabled
tc -s qdisc show | grep cake

# Find your WAN interface
ip route show | grep default
# Example output: default via 192.168.1.1 dev eth0.2
# Your WAN interface is eth0.2
```

Record:
- **WAN interface**: (e.g., `eth0.2`)
- **Gateway IP**: (e.g., `192.168.1.1`)
- **Current SQM status**: enabled/disabled

---

## Step 2: Save Current SQM Configuration

```bash
# Back up the current config (for reference)
uci export sqm > /tmp/sqm-backup.uci
cat /tmp/sqm-backup.uci
```

Copy the output and save it locally. You'll need it to re-enable SQM later.

---

## Step 3: Disable SQM for Tests 1-2 and 5-6

```bash
# Disable SQM
uci set sqm.@default[0].enabled=0
uci commit sqm
/etc/init.d/sqm stop

# Verify it's off
tc -s qdisc show | grep -i cake  # Should show nothing
echo "SQM is now DISABLED"
```

---

## Step 4: Run Test 1 - SQM OFF, IDLE

**Idle test**: Just ping, no load.

```bash
gateway-probe idle \
  --target 1.1.1.1 \
  --dns-server 1.1.1.1 \
  --output sqm-off-idle-1.json \
  --pretty
```

**What this does**:
- Pings your gateway 20 times (detects local network issues)
- Pings 1.1.1.1 (Cloudflare) 60 times
- Tests DNS resolution
- Reads CAKE stats (will show 0 or not present since SQM is off)
- Produces a JSON report

**Save the output**:
```bash
cp sqm-off-idle-1.json ~/gateway-probe-tests/
```

**Record** in your notes:
- Idle RTT p95: _____ ms (look in `latency.public_p95_ms`)
- DNS success: yes/no

---

## Step 5: Run Test 2 - SQM OFF, UPLOAD-LOADED

**Loaded test**: Ping while sustained upload traffic runs.

On your **wired LAN client** (not the gateway), start iperf3 client:
```bash
# Terminal 1: Start upload load (30 seconds)
iperf3 -c <IPERF3_SERVER> -t 30 -b 0
# Example: iperf3 -c iperf3.speedtest.fr -t 30 -b 0
```

While iperf3 is running (on your gateway):
```bash
# Terminal 2 (on gateway): Run loaded latency probe
# Time this to overlap with iperf3
gateway-probe upload-loaded \
  --target 1.1.1.1 \
  --dns-server 1.1.1.1 \
  --iperf-server <IPERF3_SERVER> \
  --duration 30 \
  --output sqm-off-upload-loaded-1.json \
  --pretty
```

**What this does**:
- Runs iperf3 upload for 30 seconds
- Concurrently pings 1.1.1.1 at ~4 pings/second
- Measures latency increase under confirmed load
- Calculates `delta_rtt_p95_ms` (loaded RTT - idle RTT)

**Save the output**:
```bash
cp sqm-off-upload-loaded-1.json ~/gateway-probe-tests/
```

**Record**:
- Loaded RTT p95: _____ ms
- Throughput: _____ Mb/s
- Delta (loaded - idle): _____ ms

---

## Step 6: Enable SQM for Tests 3-4 and 7-8

```bash
# Re-enable SQM with your current config
uci set sqm.@default[0].enabled=1
uci commit sqm
/etc/init.d/sqm start

# Wait 10 seconds for SQM to settle
sleep 10

# Verify CAKE is active
tc -s qdisc show | grep cake
# Should show something like: qdisc cake 8001: root refcnt 2 bandwidth 50Mbit ...

echo "SQM is now ENABLED"
```

---

## Step 7: Run Test 3 - SQM ON, IDLE

Same as Test 1, but with SQM enabled:

```bash
gateway-probe idle \
  --target 1.1.1.1 \
  --dns-server 1.1.1.1 \
  --output sqm-on-idle-1.json \
  --pretty
```

**Record**:
- Idle RTT p95: _____ ms
- CAKE detected: yes/no
- CAKE drops/marks: _____ / _____

---

## Step 8: Run Test 4 - SQM ON, UPLOAD-LOADED

Same as Test 2, but with SQM enabled:

```bash
# On client: iperf3 -c <SERVER> -t 30 -b 0

# On gateway (overlapping):
gateway-probe upload-loaded \
  --target 1.1.1.1 \
  --dns-server 1.1.1.1 \
  --iperf-server <IPERF3_SERVER> \
  --duration 30 \
  --output sqm-on-upload-loaded-1.json \
  --pretty
```

**Record**:
- Loaded RTT p95: _____ ms
- Throughput: _____ Mb/s
- Delta: _____ ms
- CAKE drops/marks: _____ / _____

---

## Repeat: Tests 5-8 (Second Iteration)

Repeat Steps 3-8, but save outputs as:
- `sqm-off-idle-2.json`, `sqm-off-upload-loaded-2.json`
- `sqm-on-idle-2.json`, `sqm-on-upload-loaded-2.json`

---

## Repeat: Tests 9-12 (Third Iteration)

Repeat Steps 3-8 again, save as:
- `sqm-off-idle-3.json`, `sqm-off-upload-loaded-3.json`
- `sqm-on-idle-3.json`, `sqm-on-upload-loaded-3.json`

---

## Analyzing Results

After all 12 tests, compile the results:

```bash
# Extract p95 values from each report
for f in sqm-*.json; do
  echo "$f:"
  jq '.latency.public_p95_ms, .latency.load_validation.iperf_reported_throughput_mbps' "$f"
done
```

**Create a summary table**:

| Test # | Condition | Idle p95 (ms) | Loaded p95 (ms) | Delta (ms) | Throughput (Mb/s) | CAKE Active |
|---|---|---:|---:|---:|---:|---|
| 1 | SQM off | [VAL] | — | — | — | No |
| 2 | SQM off | — | [VAL] | [VAL] | [VAL] | No |
| 5 | SQM off | [VAL] | — | — | — | No |
| 6 | SQM off | — | [VAL] | [VAL] | [VAL] | No |
| 9 | SQM off | [VAL] | — | — | — | No |
| 10 | SQM off | — | [VAL] | [VAL] | [VAL] | No |
| — | **SQM off median** | **[MED]** | **[MED]** | **[MED]** | **[MED]** | — |
| 3 | SQM on | [VAL] | — | — | — | Yes |
| 4 | SQM on | — | [VAL] | [VAL] | [VAL] | Yes |
| 7 | SQM on | [VAL] | — | — | — | Yes |
| 8 | SQM on | — | [VAL] | [VAL] | [VAL] | Yes |
| 11 | SQM on | [VAL] | — | — | — | Yes |
| 12 | SQM on | — | [VAL] | [VAL] | [VAL] | Yes |
| — | **SQM on median** | **[MED]** | **[MED]** | **[MED]** | **[MED]** | — |

**Key metric**: **Improvement = (SQM off delta) - (SQM on delta)**

Example:
- SQM off: +145 ms latency under load
- SQM on: +28 ms latency under load
- **Improvement: 117 ms** (80% reduction)

---

## Filling in the Case Study Template

With your results in hand, fill in `deployment/CASE_STUDY_TEMPLATE.md`:

1. **Equipment section**: Your router model, CPU, RAM, WAN type
2. **Results table**: Paste your summary from above
3. **Key findings**: Write 2–3 sentences about what you observed
4. **Limitations**: Document any edge cases (e.g., "signal dropped during test 7")
5. **Recommendations**: Based on results, would you enable CAKE? Why?

---

## Troubleshooting

### "iperf3: command not found"
```bash
# On your client device
brew install iperf3  # macOS
apt install iperf3   # Ubuntu/Debian
pacman -S iperf3     # Arch
```

### "gateway-probe: command not found"
```bash
# On gateway
pip install -e /path/to/gateway-probe
# Or if using git:
git clone https://github.com/zowskyy/gateway-probe.git
cd gateway-probe
pip install -e .
```

### "Cannot reach iperf3 server"
- Verify server is reachable: `ping <SERVER>`
- Check firewall isn't blocking port 5201
- Try a public server: `iperf3.speedtest.fr` or `iperf3.opencloud.lu`

### "CAKE not detected even though SQM is on"
```bash
# Verify SQM actually enabled
uci show sqm | grep enabled

# Check if sqm service is running
/etc/init.d/sqm status

# Force restart
/etc/init.d/sqm stop
sleep 2
/etc/init.d/sqm start
```

### "High packet loss (>5%)"
- Network may be congested; try a different time of day
- Check for interference if using Wi-Fi
- Try a closer iperf3 server

---

## Next Steps After Testing

1. **Copy all JSON reports** to your local machine for safekeeping
2. **Fill in CASE_STUDY_TEMPLATE.md** with your results
3. **Post to r/openwrt** with a link to your case study
4. **Share findings** in the gateway-probe GitHub discussions

Good luck! 🚀
