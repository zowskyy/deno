#!/bin/sh
# gateway-probe: one-shot four-condition CAKE test runner.
#
# Runs on the OpenWrt router itself — no laptop or separate LAN client
# needed. Installs what it needs, fetches the probe source if not already
# present, runs SQM off/on x idle/loaded (3 iterations, 12 runs total),
# and prints a summary table with medians and the CAKE improvement delta.
#
# Usage (paste this whole block into an SSH session on the router):
#
#   IPERF_SERVER=iperf3.example.com sh run-four-condition-test.sh
#
# Optional overrides (env vars), all have sane defaults except IPERF_SERVER:
#   TARGET               public ping target              (default: 1.1.1.1)
#   DURATION             seconds per loaded test          (default: 30)
#   ITERATIONS           repetitions of the 4-condition set (default: 3)
#   PROBE_DIR            where to fetch/run the code from (default: /tmp/gateway-probe)
#   SQM_SETTLE_SECONDS   pause after re-enabling SQM      (default: 10)
#   REPO_TARBALL_URL     source to fetch if probe/ missing
#
# Safe to re-run: SQM is left enabled when the script finishes (or fails).

set -e

TARGET="${TARGET:-1.1.1.1}"
DURATION="${DURATION:-30}"
ITERATIONS="${ITERATIONS:-3}"
PROBE_DIR="${PROBE_DIR:-/tmp/gateway-probe}"
SQM_SETTLE_SECONDS="${SQM_SETTLE_SECONDS:-10}"
REPO_TARBALL_URL="${REPO_TARBALL_URL:-https://github.com/zowskyy/deno/archive/refs/heads/claude/gateway-probe-mvp-ueca5r.tar.gz}"
RESULTS_DIR="$PROBE_DIR/results"

if [ -z "$IPERF_SERVER" ]; then
  echo "ERROR: set IPERF_SERVER to a WAN-reachable iperf3 server first, e.g.:"
  echo "  IPERF_SERVER=iperf3.example.com sh $0"
  exit 1
fi

echo "=== Environment check ==="
command -v python3 >/dev/null 2>&1 || { echo "Installing python3-base..."; opkg update && opkg install python3-base; }
command -v iperf3 >/dev/null 2>&1  || { echo "Installing iperf3...";       opkg update && opkg install iperf3; }
command -v uci >/dev/null 2>&1     || { echo "ERROR: uci not found — is this really an OpenWrt router?"; exit 1; }

if [ ! -d "$PROBE_DIR/probe" ]; then
  echo "=== Fetching gateway-probe source into $PROBE_DIR ==="
  mkdir -p "$PROBE_DIR"
  cd "$PROBE_DIR"
  wget -O src.tar.gz "$REPO_TARBALL_URL"
  tar xzf src.tar.gz --strip-components=1
  rm -f src.tar.gz
fi

cd "$PROBE_DIR"
if [ ! -d "probe" ]; then
  echo "ERROR: probe/ package not found in $PROBE_DIR after fetch."
  echo "If the repo is private, wget above will 404 — copy the source here manually instead."
  exit 1
fi
mkdir -p "$RESULTS_DIR"

sqm_off() {
  uci set sqm.@default[0].enabled=0 2>/dev/null || true
  uci commit sqm 2>/dev/null || true
  /etc/init.d/sqm stop >/dev/null 2>&1 || true
  sleep 2
}

sqm_on() {
  uci set sqm.@default[0].enabled=1 2>/dev/null || true
  uci commit sqm 2>/dev/null || true
  /etc/init.d/sqm start >/dev/null 2>&1 || true
  sleep "$SQM_SETTLE_SECONDS"
}

run_idle() {
  label="$1"
  echo "  [idle]   $label"
  python3 -m probe.cli --mode idle --target "$TARGET" \
    --output "$RESULTS_DIR/$label.json" >"$RESULTS_DIR/$label.log" 2>&1 || \
    echo "    (probe exited non-zero — see $RESULTS_DIR/$label.log)"
}

run_loaded() {
  label="$1"
  echo "  [loaded] $label (~${DURATION}s)"
  python3 -m probe.cli --mode upload-loaded --target "$TARGET" \
    --iperf-server "$IPERF_SERVER" --duration "$DURATION" \
    --output "$RESULTS_DIR/$label.json" >"$RESULTS_DIR/$label.log" 2>&1 || \
    echo "    (probe exited non-zero — see $RESULTS_DIR/$label.log)"
}

est_seconds=$(( ITERATIONS * (15 + (DURATION + 15) * 2 + SQM_SETTLE_SECONDS + 15) ))
est_minutes=$(( (est_seconds + 59) / 60 ))

echo ""
echo "=== gateway-probe four-condition test ==="
echo "Target: $TARGET | iperf3 server: $IPERF_SERVER | duration: ${DURATION}s | iterations: $ITERATIONS"
echo "Estimated total time: ~${est_minutes} min"
echo ""

i=1
while [ "$i" -le "$ITERATIONS" ]; do
  echo "--- Iteration $i/$ITERATIONS ---"

  echo "Disabling SQM..."
  sqm_off
  run_idle "sqm-off-idle-$i"
  run_loaded "sqm-off-upload-loaded-$i"

  echo "Enabling SQM..."
  sqm_on
  run_idle "sqm-on-idle-$i"
  run_loaded "sqm-on-upload-loaded-$i"

  i=$((i + 1))
done

echo ""
echo "=== All ${ITERATIONS}x4 runs complete. Confirming SQM is enabled. ==="
sqm_on

echo ""
echo "=== Summary ==="
python3 - "$RESULTS_DIR" <<'PYEOF'
import glob
import json
import os
import sys
from statistics import median

results_dir = sys.argv[1]
groups = {
    "sqm-off-idle": [],
    "sqm-off-upload-loaded": [],
    "sqm-on-idle": [],
    "sqm-on-upload-loaded": [],
}

for path in sorted(glob.glob(os.path.join(results_dir, "*.json"))):
    name = os.path.basename(path).rsplit(".json", 1)[0]
    for prefix in groups:
        if name.startswith(prefix + "-"):
            try:
                with open(path) as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError):
                continue
            lat = data.get("latency", {})
            groups[prefix].append({
                "file": name,
                "p95": lat.get("public_p95_ms"),
                "throughput": lat.get("loaded_throughput_mbps"),
                "valid": lat.get("load_validation", {}).get("valid_for_wan_comparison"),
                "loss": lat.get("loss_percent"),
            })
            break


def fmt(v, suffix=""):
    return f"{v}{suffix}" if v is not None else "-"


print(f"{'Condition':<26}{'Run':<24}{'p95 (ms)':>10}{'Throughput':>13}{'Valid':>7}{'Loss %':>8}")
print("-" * 90)
for prefix, rows in groups.items():
    for r in rows:
        print(f"{prefix:<26}{r['file']:<24}{fmt(r['p95']):>10}{fmt(r['throughput'], ' Mb/s'):>13}{str(r['valid']):>7}{fmt(r['loss']):>8}")

print()
print("=== Medians (loaded runs only counted if valid_for_wan_comparison) ===")
idle_off = [r["p95"] for r in groups["sqm-off-idle"] if r["p95"] is not None]
idle_on = [r["p95"] for r in groups["sqm-on-idle"] if r["p95"] is not None]
loaded_off = [r["p95"] for r in groups["sqm-off-upload-loaded"] if r["p95"] is not None and r["valid"]]
loaded_on = [r["p95"] for r in groups["sqm-on-upload-loaded"] if r["p95"] is not None and r["valid"]]


def show(label, vals):
    if vals:
        print(f"{label}: median {median(vals):.1f} ms (n={len(vals)})")
    else:
        print(f"{label}: no valid data")


show("SQM off, idle  ", idle_off)
show("SQM off, loaded", loaded_off)
show("SQM on,  idle  ", idle_on)
show("SQM on,  loaded", loaded_on)

delta_off = delta_on = None
if idle_off and loaded_off:
    delta_off = median(loaded_off) - median(idle_off)
    print(f"\nSQM OFF added latency under load: {delta_off:.1f} ms")
if idle_on and loaded_on:
    delta_on = median(loaded_on) - median(idle_on)
    print(f"SQM ON  added latency under load: {delta_on:.1f} ms")
if delta_off is not None and delta_on is not None:
    print(f"\n>>> CAKE improvement: {delta_off - delta_on:.1f} ms less added latency <<<")

invalid = [r for rows in groups.values() for r in rows if r["valid"] is False]
if invalid:
    print(f"\nWARNING: {len(invalid)} loaded run(s) were NOT valid for WAN comparison.")
    print("(iperf3 throughput too low, load didn't reach the WAN, or iperf3 failed.)")
    print("Check the matching .log file for each and consider re-running just those.")
PYEOF

echo ""
echo "Raw reports and logs: $RESULTS_DIR"
echo "Next: paste the summary numbers above into deployment/CASE_STUDY_TEMPLATE.md"
