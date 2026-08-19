"""Command-line interface for gateway-probe."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .discovery import discover_wan_interface
from .report import build_report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="gateway-probe",
        description="Read-only network diagnostic tool for OpenWrt / Linux gateways.",
    )
    parser.add_argument(
        "--wan-interface",
        metavar="IFACE",
        default=None,
        help="WAN interface name (default: auto-discover from default route).",
    )
    parser.add_argument(
        "--gateway",
        metavar="IP",
        default=None,
        help="Gateway IP to ping (default: discovered from routing table).",
    )
    parser.add_argument(
        "--dns-server",
        metavar="IP",
        default=None,
        help="DNS server to test (default: system resolver).",
    )
    parser.add_argument(
        "--dns-hostname",
        metavar="HOST",
        default="example.com",
        help="Hostname to resolve during DNS probe (default: example.com).",
    )
    parser.add_argument(
        "--target",
        metavar="IP_OR_HOST",
        default=None,
        help="Public target for latency probes (default: 1.1.1.1).",
    )
    parser.add_argument(
        "--mode",
        choices=["idle", "upload-loaded", "download-loaded"],
        default="idle",
        help="Latency probe mode (default: idle).",
    )
    parser.add_argument(
        "--iperf-server",
        metavar="IP_OR_HOST",
        default=None,
        help="iperf3 server address (required for upload-loaded / download-loaded modes).",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=30,
        metavar="SECONDS",
        help="Duration of loaded latency test in seconds (default: 30).",
    )
    parser.add_argument(
        "--idle-pings",
        type=int,
        default=60,
        metavar="N",
        help="Number of pings in idle mode (default: 60).",
    )
    parser.add_argument(
        "--min-valid-throughput",
        type=float,
        default=5.0,
        metavar="MBPS",
        help=(
            "Minimum iperf3 throughput (Mb/s) for a loaded test to be considered "
            "valid evidence of WAN load — lower this on slow (e.g. rural/satellite) "
            "links, or the classifier will suppress real bufferbloat findings (default: 5.0)."
        ),
    )
    parser.add_argument(
        "--idle-baseline-p95",
        type=float,
        default=None,
        metavar="MS",
        help=(
            "Idle public RTT p95 (ms) from a prior idle run, used to compute "
            "latency.delta_rtt_p95_ms within a single loaded-mode run. "
            "For a rigorous two-run comparison use gateway-probe-compare instead."
        ),
    )
    parser.add_argument(
        "--store",
        metavar="FILE",
        default=None,
        help="SQLite event-store file to append this report to (optional).",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default=None,
        help="Write JSON report to FILE (default: stdout).",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        default=True,
        help="Pretty-print JSON output (default: true).",
    )
    parser.add_argument(
        "--no-pretty",
        dest="pretty",
        action="store_false",
        help="Emit compact JSON.",
    )
    parser.add_argument(
        "--config",
        metavar="FILE",
        default=None,
        help="Load configuration from TOML file (optional).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    # Load configuration file if provided
    if args.config:
        from .config import GatewayProbeConfig
        cfg = GatewayProbeConfig.from_toml(args.config)
        # Command-line args override config file
        if not args.target and cfg.probe.target:
            args.target = cfg.probe.target
        if not args.dns_server and cfg.probe.dns_server:
            args.dns_server = cfg.probe.dns_server
        if not args.wan_interface and cfg.probe.wan_interface:
            args.wan_interface = cfg.probe.wan_interface
        if not args.gateway and cfg.probe.gateway:
            args.gateway = cfg.probe.gateway
        if not args.iperf_server and cfg.latency.iperf_server:
            args.iperf_server = cfg.latency.iperf_server

    if not args.target:
        args.target = "1.1.1.1"

    # Auto-discover WAN interface
    wan_interface = args.wan_interface
    if not wan_interface:
        wan_interface = discover_wan_interface()
        if not wan_interface:
            print(
                "error: could not auto-discover WAN interface from default route. "
                "Pass --wan-interface explicitly.",
                file=sys.stderr,
            )
            return 1
        print(f"[gateway-probe] discovered WAN interface: {wan_interface}", file=sys.stderr)

    if args.mode in ("upload-loaded", "download-loaded") and not args.iperf_server:
        print(
            f"error: --iperf-server is required for mode '{args.mode}'.",
            file=sys.stderr,
        )
        return 1

    print(
        f"[gateway-probe] probing: iface={wan_interface} mode={args.mode} "
        f"target={args.target} dns={args.dns_server or 'system'}",
        file=sys.stderr,
    )

    report = build_report(
        wan_interface=wan_interface,
        gateway=args.gateway,
        dns_server=args.dns_server,
        target=args.target,
        mode=args.mode,
        iperf_server=args.iperf_server,
        duration=args.duration,
        idle_ping_count=args.idle_pings,
        dns_hostname=args.dns_hostname,
        idle_baseline_p95_ms=args.idle_baseline_p95,
        min_valid_throughput_mbps=args.min_valid_throughput,
    )

    indent = 2 if args.pretty else None
    text = json.dumps(report, indent=indent)

    output_write_failed = False
    if args.output:
        try:
            Path(args.output).write_text(text + "\n")
            print(f"[gateway-probe] report written to {args.output}", file=sys.stderr)
        except OSError as exc:
            output_write_failed = True
            print(f"[gateway-probe] error: could not write --output file '{args.output}': {exc}", file=sys.stderr)
            print(
                "[gateway-probe] (check the parent directory exists and is writable — "
                "printing the report to stdout instead, so it isn't lost)",
                file=sys.stderr,
            )
            print(text)
    else:
        print(text)

    store_failed = False
    if args.store:
        import sqlite3

        from .config import RetentionConfig
        from .store import apply_retention, open_store, save_report

        retention_cfg = cfg.retention if args.config else RetentionConfig()

        try:
            conn = open_store(args.store)
        except (sqlite3.OperationalError, sqlite3.DatabaseError, OSError) as exc:
            store_failed = True
            print(f"[gateway-probe] error: could not open --store file '{args.store}': {exc}", file=sys.stderr)
            print(
                "[gateway-probe] (the report above was still generated — "
                "check that the parent directory exists and is writable)",
                file=sys.stderr,
            )
            conn = None

        if conn is not None:
            row_id = save_report(conn, report)
            print(f"[gateway-probe] report #{row_id} saved to {args.store}", file=sys.stderr)

            try:
                event = apply_retention(conn, args.store, retention_cfg)
                if event["records_deleted"] > 0:
                    print(
                        f"[gateway-probe] retention: {event['details']}",
                        file=sys.stderr,
                    )
            except Exception as exc:
                print(f"[gateway-probe] warning: retention cleanup failed: {exc}", file=sys.stderr)
            finally:
                conn.close()

    # Print findings summary to stderr
    findings = report.get("findings", [])
    if findings:
        print(f"\n[gateway-probe] {len(findings)} finding(s):", file=sys.stderr)
        for f in findings:
            pct = int(f["confidence"] * 100)
            msg = f.get("interpretation", f.get("reason", "unknown"))
            print(f"  [{pct}%] {f['category']}: {msg}", file=sys.stderr)
    else:
        print("[gateway-probe] no significant issues detected.", file=sys.stderr)

    return 1 if (output_write_failed or store_failed) else 0


if __name__ == "__main__":
    sys.exit(main())
