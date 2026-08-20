"""Long-running observe-only controller daemon entry point.

Refuses to start if it detects it is running with CAP_NET_ADMIN — the
observe-only controller must never hold the privilege that would let it
mutate a qdisc; that capability belongs only to the (not-yet-built)
actuator process. Runs as a long-running process with an internal
monotonic scheduler, per procd conventions (never a one-shot timer).
"""

from __future__ import annotations

import argparse
import sys
import time

_CAP_NET_ADMIN_BIT = 12
_PROC_STATUS_PATH = "/proc/self/status"


def _has_cap_net_admin() -> bool:
    try:
        with open(_PROC_STATUS_PATH, encoding="ascii") as f:
            for line in f:
                if line.startswith("CapEff:"):
                    hex_value = line.split(":", 1)[1].strip()
                    mask = int(hex_value, 16)
                    return bool(mask & (1 << _CAP_NET_ADMIN_BIT))
    except (OSError, ValueError):
        return False
    return False


def run_observe_only(*, store_path: str, interval_seconds: float) -> None:
    if _has_cap_net_admin():
        raise RuntimeError(
            "controller daemon must not run with CAP_NET_ADMIN; "
            "actuation is a separate, not-yet-approved privileged process"
        )

    from .controller_store import ControllerStore

    store = ControllerStore(store_path)
    store.initialize()

    deadline = time.monotonic()
    while True:
        deadline += interval_seconds
        # Observation cycle placeholder: collection + policy evaluation
        # wiring is added once the collector integration lands. This loop
        # exists to prove the scheduler shape (deadline accumulation, not
        # a one-shot procd timer) ahead of that wiring.
        sleep_for = max(0.0, deadline - time.monotonic())
        time.sleep(sleep_for)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="gateway-probe-control")
    parser.add_argument("--store", required=True)
    parser.add_argument("--interval-seconds", type=float, default=60.0)
    parser.add_argument("--mode", default="observe_only")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    if args.mode != "observe_only":
        print(f"unsupported mode: {args.mode!r} (only observe_only is implemented)", file=sys.stderr)
        raise SystemExit(1)

    if not (5.0 <= args.interval_seconds <= 3600.0):
        print(
            f"--interval-seconds must be within 5-3600, got {args.interval_seconds}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    run_observe_only(store_path=args.store, interval_seconds=args.interval_seconds)


if __name__ == "__main__":
    main()
