"""Command-line interface for gateway-probe's device inventory (gateway-probe-devices)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .devices_report import build_device_report


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="gateway-probe-devices",
        description=(
            "List devices currently on your local network, in plain language. "
            "Read-only: never changes network configuration."
        ),
    )
    parser.add_argument(
        "--store",
        metavar="FILE",
        default=None,
        help=(
            "Device-baseline SQLite file — pass the same file each time to get "
            "'what's new since last scan' (optional; without it, just shows the "
            "current snapshot with no history)."
        ),
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
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    report = build_device_report(db_path=args.store)

    indent = 2 if args.pretty else None
    text = json.dumps(report, indent=indent)

    if args.output:
        Path(args.output).write_text(text + "\n")
        print(f"[gateway-probe-devices] report written to {args.output}", file=sys.stderr)
    else:
        print(text)

    print(f"\n{report['summary']}", file=sys.stderr)

    if report["new_devices"]:
        print("\nNew devices:", file=sys.stderr)
        for d in report["new_devices"]:
            label = d.get("vendor") or (
                "private/randomized device" if d["type"] == "randomized_private" else "unknown device"
            )
            print(f"  {d['mac']}  ({label})  at {d.get('ip', '?')}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
