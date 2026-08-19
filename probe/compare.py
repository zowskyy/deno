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


class ReportLoadError(Exception):
    """A report file couldn't be read or doesn't look like a gateway-probe
    report — raised with a message meant to be printed directly to the
    user, never as an uncaught traceback."""


def _load_report(path: str, label: str) -> dict:
    """Load and parse a gateway-probe report JSON file at *path*.

    Every foreseeable failure (missing file, a directory, unreadable,
    binary/wrong-encoding, malformed JSON, or valid JSON that just isn't a
    gateway-probe report) raises ReportLoadError with a plain-language
    message instead of letting FileNotFoundError/JSONDecodeError/etc.
    propagate as a raw traceback.
    """
    p = Path(path)
    try:
        text = p.read_text()
    except FileNotFoundError:
        raise ReportLoadError(f"{label} report not found: {path}")
    except IsADirectoryError:
        raise ReportLoadError(f"{label} report path is a directory, not a file: {path}")
    except PermissionError:
        raise ReportLoadError(f"permission denied reading {label} report: {path}")
    except UnicodeDecodeError:
        raise ReportLoadError(f"{label} report is not a readable text file: {path}")

    try:
        report = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ReportLoadError(f"{label} report is not valid JSON ({exc}): {path}")

    if not isinstance(report, dict) or "latency" not in report:
        raise ReportLoadError(
            f'{label} report does not look like a gateway-probe report '
            f'(missing "latency" key): {path}'
        )

    return report


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


def _warn_if_likely_argument_swap(idle: dict, loaded: dict) -> None:
    """Catch the single most consequential mistake this tool can't detect
    from the math alone: idle_report and loaded_report passed in the
    wrong order. The delta comes out with the wrong sign and the
    interpretation silently flips to its opposite conclusion — verified
    directly: a real bufferbloat report compared in swapped order reports
    "no significant bufferbloat detected" instead of the true finding.
    latency.mode is already present on every real report, so this is a
    cheap, reliable check.
    """
    idle_mode = idle.get("latency", {}).get("mode")
    loaded_mode = loaded.get("latency", {}).get("mode")

    if idle_mode is not None and idle_mode != "idle":
        print(
            f"warning: the idle_report's latency.mode is '{idle_mode}', not 'idle' — "
            "did you swap the idle_report/loaded_report arguments?",
            file=sys.stderr,
        )
    if loaded_mode == "idle":
        print(
            "warning: the loaded_report's latency.mode is 'idle' — "
            "did you swap the idle_report/loaded_report arguments?",
            file=sys.stderr,
        )


def _warn_if_schema_version_mismatch(idle: dict, loaded: dict) -> None:
    idle_schema = idle.get("schema_version")
    loaded_schema = loaded.get("schema_version")
    if idle_schema is not None and loaded_schema is not None and idle_schema != loaded_schema:
        print(
            f"warning: comparing reports from different schema_versions "
            f"(idle={idle_schema}, loaded={loaded_schema}) — fields may not line up",
            file=sys.stderr,
        )


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

    try:
        idle = _load_report(args.idle_report, "idle")
        loaded = _load_report(args.loaded_report, "loaded")
    except ReportLoadError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    _warn_if_likely_argument_swap(idle, loaded)
    _warn_if_schema_version_mismatch(idle, loaded)

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
