"""Compute before/after latency deltas between an idle and a loaded report.

This is the primary way gateway-probe demonstrates the effect of CAKE (or its
absence): run one probe in --mode idle, another in --mode upload-loaded or
--mode download-loaded, then compare the two reports.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BUFFERBLOAT_MODERATE_MS = 20
BUFFERBLOAT_SIGNIFICANT_MS = 50


def _delta(loaded: float | None, idle: float | None) -> float | None:
    if loaded is None or idle is None:
        return None
    return round(loaded - idle, 2)


def _interpret(delta_p95: float | None, cake_detected: bool) -> str:
    if delta_p95 is None:
        return "Insufficient data to compute queue delay."
    if delta_p95 <= BUFFERBLOAT_MODERATE_MS:
        return "Queue delay is minimal; no significant bufferbloat detected."
    if delta_p95 <= BUFFERBLOAT_SIGNIFICANT_MS:
        return "Moderate queue delay observed; borderline bufferbloat."
    if cake_detected:
        return (
            "Significant queue delay despite CAKE being active; "
            "consider lowering the CAKE bandwidth limit closer to the actual line rate."
        )
    return (
        "Strong evidence of local or near-local bufferbloat; "
        "enabling CAKE on the WAN egress qdisc is recommended."
    )


def compare_reports(idle: dict, loaded: dict) -> dict:
    """Return a comparison dict summarizing idle vs. loaded latency."""
    idle_lat = idle.get("latency", {})
    loaded_lat = loaded.get("latency", {})

    idle_p50 = idle_lat.get("public_p50_ms")
    idle_p95 = idle_lat.get("public_p95_ms")
    loaded_p50 = loaded_lat.get("public_p50_ms")
    loaded_p95 = loaded_lat.get("public_p95_ms")

    delta_p50 = _delta(loaded_p50, idle_p50)
    delta_p95 = _delta(loaded_p95, idle_p95)

    cake_detected = loaded.get("qdisc", {}).get("cake_detected", False)

    return {
        "loaded_mode": loaded_lat.get("mode"),
        "idle_rtt_p50_ms": idle_p50,
        "idle_rtt_p95_ms": idle_p95,
        "loaded_rtt_p50_ms": loaded_p50,
        "loaded_rtt_p95_ms": loaded_p95,
        "delta_rtt_p50_ms": delta_p50,
        "delta_rtt_p95_ms": delta_p95,
        "throughput_mbps": loaded_lat.get("loaded_throughput_mbps"),
        "packet_loss_percent": loaded_lat.get("loss_percent"),
        "cake_detected": cake_detected,
        "interpretation": _interpret(delta_p95, cake_detected),
    }


def format_comparison_text(comparison: dict) -> str:
    """Render a comparison dict as a short human-readable report."""
    mode = comparison.get("loaded_mode") or "loaded"
    label = "Upload" if mode == "upload-loaded" else "Download" if mode == "download-loaded" else "Loaded"

    lines = [f"{label} queue delay:"]
    idle_p95 = comparison.get("idle_rtt_p95_ms")
    loaded_p95 = comparison.get("loaded_rtt_p95_ms")
    delta_p95 = comparison.get("delta_rtt_p95_ms")

    if idle_p95 is not None and loaded_p95 is not None:
        lines.append(f"{loaded_p95:.0f} ms loaded (baseline {idle_p95:.0f} ms idle)")
    if delta_p95 is not None:
        lines.append(f"Delta (queue delay): {delta_p95:.0f} ms")

    throughput = comparison.get("throughput_mbps")
    if throughput is not None:
        lines.append(f"Throughput: {throughput:.1f} Mbps")

    loss = comparison.get("packet_loss_percent")
    if loss is not None:
        lines.append(f"Packet loss: {loss:.1f}%")

    lines.append("")
    lines.append("Interpretation:")
    lines.append(comparison.get("interpretation", ""))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gateway-probe-compare",
        description="Compare an idle-mode report against a loaded-mode report to quantify bufferbloat.",
    )
    parser.add_argument("idle_report", help="Path to a report JSON collected with --mode idle")
    parser.add_argument(
        "loaded_report",
        help="Path to a report JSON collected with --mode upload-loaded or --mode download-loaded",
    )
    parser.add_argument("--output", metavar="FILE", default=None, help="Write comparison JSON to FILE")
    args = parser.parse_args(argv)

    idle = json.loads(Path(args.idle_report).read_text())
    loaded = json.loads(Path(args.loaded_report).read_text())

    comparison = compare_reports(idle, loaded)

    print(format_comparison_text(comparison), file=sys.stderr)

    out_text = json.dumps(comparison, indent=2)
    if args.output:
        Path(args.output).write_text(out_text + "\n")
        print(f"\n[gateway-probe-compare] comparison written to {args.output}", file=sys.stderr)
    else:
        print(out_text)

    return 0


if __name__ == "__main__":
    sys.exit(main())
