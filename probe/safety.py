"""Timed-rollback safety wrapper for automatic QoS (SQM/CAKE) changes.

This module is intentionally standalone: it must keep working even if the
dashboard/API process (probe.api) has crashed, so it is never imported by
api.py and can be run as its own process:

    python -m probe.safety apply \\
        --backup /root/sqm-backup.uci \\
        --new-config /root/sqm-proposed.uci \\
        --gateway 192.168.12.1 \\
        --target 1.1.1.1 \\
        --confirm-timeout 120 \\
        --confirm-file /tmp/gateway-probe-confirm

Flow, per the Phase 1 design:
    1. Save current SQM configuration.
    2. Apply proposed configuration.
    3. Test gateway reachability.
    4. Test WAN reachability.
    5. If either check fails, immediately restore the old configuration.
    6. Otherwise wait up to --confirm-timeout seconds for a confirmation
       (touching --confirm-file). If confirmation does not arrive in time,
       restore the old configuration automatically.

Phase 1 never calls this automatically — gateway-probe's default probe run
is entirely read-only. This wrapper exists so that Phase 2 automation has a
tested, independent-of-the-dashboard safety net to build on.
"""

from __future__ import annotations

import argparse
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .latency import probe_ping
from .shell import run_command as _run

DEFAULT_CONFIRM_TIMEOUT = 120
DEFAULT_REACHABILITY_PING_COUNT = 5
DEFAULT_REACHABILITY_DEADLINE = 10


def save_sqm_config(backup_path: Path) -> None:
    """Snapshot the current UCI 'sqm' config to *backup_path*."""
    _, stdout, _ = _run(["uci", "export", "sqm"])
    backup_path.write_text(stdout)


def apply_sqm_config(config_path: Path) -> bool:
    """Import *config_path* as the UCI 'sqm' config, commit, and restart sqm."""
    if not config_path.exists():
        return False
    text = config_path.read_text()
    rc, _, _ = _run(["uci", "import", "sqm"], input_text=text)
    if rc != 0:
        return False
    rc, _, _ = _run(["uci", "commit", "sqm"])
    if rc != 0:
        return False
    rc, _, _ = _run(["/etc/init.d/sqm", "restart"])
    return rc == 0


def gateway_reachable(gateway: str) -> bool:
    result = probe_ping(gateway, count=DEFAULT_REACHABILITY_PING_COUNT, deadline=DEFAULT_REACHABILITY_DEADLINE)
    return bool(result.get("success", False))


def public_path_reachable(target: str) -> bool:
    result = probe_ping(target, count=DEFAULT_REACHABILITY_PING_COUNT, deadline=DEFAULT_REACHABILITY_DEADLINE)
    return bool(result.get("success", False))


@dataclass
class RollbackController:
    """Apply a new config with a verified, timed rollback to the old one.

    All side-effecting steps are injectable functions so this can be tested
    without real UCI/network access, and so the watchdog logic is provable
    in isolation from any dashboard or CLI wiring.
    """

    old_config_path: Path
    new_config_path: Path
    gateway: str
    target: str
    confirm_timeout: int = DEFAULT_CONFIRM_TIMEOUT

    save_config_fn: Callable[[Path], None] = save_sqm_config
    apply_config_fn: Callable[[Path], bool] = apply_sqm_config
    gateway_reachable_fn: Callable[[str], bool] = gateway_reachable
    public_reachable_fn: Callable[[str], bool] = public_path_reachable

    _rollback_timer: threading.Timer | None = field(default=None, init=False, repr=False)
    _confirmed: threading.Event = field(default_factory=threading.Event, init=False, repr=False)
    _rolled_back: threading.Event = field(default_factory=threading.Event, init=False, repr=False)

    def apply_with_rollback(self) -> str:
        """Apply the new config; verify it; arm a timed rollback if it passes."""
        self.save_config_fn(self.old_config_path)

        if not self.apply_config_fn(self.new_config_path):
            return "failed: could not apply new configuration"

        if not self.gateway_reachable_fn(self.gateway):
            self.apply_config_fn(self.old_config_path)
            self._rolled_back.set()
            return "rollback: gateway unreachable"

        if not self.public_reachable_fn(self.target):
            self.apply_config_fn(self.old_config_path)
            self._rolled_back.set()
            return "rollback: WAN unreachable"

        self._schedule_rollback()
        return "awaiting confirmation"

    def confirm(self) -> None:
        """Cancel the pending rollback — the new configuration is kept."""
        self._confirmed.set()
        if self._rollback_timer is not None:
            self._rollback_timer.cancel()

    def wait_for_outcome(self, extra: float = 0.5) -> None:
        """Block until the rollback timer fires or is cancelled (test helper)."""
        if self._rollback_timer is not None:
            time.sleep(self.confirm_timeout + extra)

    def _schedule_rollback(self) -> None:
        self._confirmed.clear()
        self._rolled_back.clear()
        self._rollback_timer = threading.Timer(self.confirm_timeout, self._rollback_if_unconfirmed)
        self._rollback_timer.daemon = True
        self._rollback_timer.start()

    def _rollback_if_unconfirmed(self) -> None:
        if not self._confirmed.is_set():
            self.apply_config_fn(self.old_config_path)
            self._rolled_back.set()


def watch_confirm_file(
    confirm_file: Path,
    controller: RollbackController,
    poll_interval: float = 1.0,
) -> None:
    """Poll *confirm_file* for existence; call controller.confirm() when it appears.

    Runs in the calling thread — intended to be the main loop of a standalone
    `python -m probe.safety apply ...` process, independent of any dashboard.
    """
    while not controller._confirmed.is_set() and not controller._rolled_back.is_set():
        if confirm_file.exists():
            controller.confirm()
            confirm_file.unlink(missing_ok=True)
            return
        time.sleep(poll_interval)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gateway-probe-safety",
        description=(
            "Apply a proposed SQM/CAKE config with a verified, timed rollback. "
            "Runs standalone, independent of the dashboard process."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    apply_p = sub.add_parser("apply", help="Apply new-config with rollback protection")
    apply_p.add_argument("--backup", required=True, metavar="FILE", help="Where to save the current config")
    apply_p.add_argument("--new-config", required=True, metavar="FILE", help="Proposed config to apply")
    apply_p.add_argument("--gateway", required=True, metavar="IP", help="Gateway IP for reachability check")
    apply_p.add_argument("--target", required=True, metavar="IP", help="Public IP for WAN reachability check")
    apply_p.add_argument(
        "--confirm-timeout",
        type=int,
        default=DEFAULT_CONFIRM_TIMEOUT,
        metavar="SECONDS",
        help=f"Seconds to wait for confirmation before auto-rollback (default: {DEFAULT_CONFIRM_TIMEOUT})",
    )
    apply_p.add_argument(
        "--confirm-file",
        required=True,
        metavar="FILE",
        help="Touch this file to confirm and keep the new configuration",
    )

    args = parser.parse_args(argv)

    if args.command == "apply":
        controller = RollbackController(
            old_config_path=Path(args.backup),
            new_config_path=Path(args.new_config),
            gateway=args.gateway,
            target=args.target,
            confirm_timeout=args.confirm_timeout,
        )
        outcome = controller.apply_with_rollback()
        print(f"[gateway-probe-safety] {outcome}", file=sys.stderr)

        if outcome == "awaiting confirmation":
            print(
                f"[gateway-probe-safety] touch {args.confirm_file} within "
                f"{args.confirm_timeout}s to keep the new config, or do nothing to roll back.",
                file=sys.stderr,
            )
            watch_confirm_file(Path(args.confirm_file), controller)
            final = "confirmed: new configuration kept" if controller._confirmed.is_set() else "rolled back: no confirmation received"
            print(f"[gateway-probe-safety] {final}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
