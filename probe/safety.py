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
    1. Save current SQM configuration. Abort here (never touching the new
       config) if the save itself fails — you cannot safely try an
       untested config if you have no way back to the old one.
    2. Apply proposed configuration.
    3. Test gateway reachability.
    4. Test WAN reachability.
    5. If either check fails, immediately restore the old configuration —
       and verify that the restore itself actually succeeded; report a
       distinct failure state if it didn't, rather than claiming success.
    6. Otherwise wait up to --confirm-timeout seconds for a confirmation
       (touching --confirm-file). If confirmation does not arrive in time,
       restore the old configuration automatically (same verified-restore
       guarantee as step 5).

Every outcome this module reports is meant to be an accurate description
of what state the router is actually in — "rollback" always means the
restore was verified to succeed, never just "we tried."

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
MIN_CONFIRM_TIMEOUT = 5
DEFAULT_REACHABILITY_PING_COUNT = 5
DEFAULT_REACHABILITY_DEADLINE = 10
MAX_ACCEPTABLE_LOSS_PERCENT = 20.0
SQM_RESTART_TIMEOUT_SECONDS = 30


@dataclass
class ApplyResult:
    """Result of attempting to apply a UCI 'sqm' config.

    success is True only if import + commit + restart all succeeded.
    disk_committed is True as soon as 'uci commit' succeeds, independent
    of whether the later restart also succeeded — this distinction matters
    because a commit that succeeds followed by a restart that fails still
    means the ON-DISK config has changed and needs the same rollback
    treatment as any other failure, not the "nothing happened" treatment
    of an import/commit failure that never touched disk.
    """
    success: bool
    disk_committed: bool
    reason: str = ""


def save_sqm_config(backup_path: Path) -> bool:
    """Snapshot the current UCI 'sqm' config to *backup_path*.

    Returns False (and does NOT write backup_path) if 'uci export' fails —
    a failed export must never produce an empty/garbage backup file that a
    later rollback would silently "restore" from, clearing the sqm config
    instead of actually restoring it.
    """
    rc, stdout, _stderr = _run(["uci", "export", "sqm"])
    if rc != 0:
        return False
    backup_path.write_text(stdout)
    return True


def apply_sqm_config(config_path: Path) -> ApplyResult:
    """Import *config_path* as the UCI 'sqm' config, commit, and restart sqm."""
    if not config_path.exists():
        return ApplyResult(success=False, disk_committed=False, reason=f"config file not found: {config_path}")

    text = config_path.read_text()
    rc, _, stderr = _run(["uci", "import", "sqm"], input_text=text)
    if rc != 0:
        return ApplyResult(success=False, disk_committed=False, reason=f"uci import failed: {stderr or rc}")

    rc, _, stderr = _run(["uci", "commit", "sqm"])
    if rc != 0:
        return ApplyResult(success=False, disk_committed=False, reason=f"uci commit failed: {stderr or rc}")

    # From this point on the on-disk config HAS changed, regardless of
    # whether the restart below succeeds.
    rc, _, stderr = _run(["/etc/init.d/sqm", "restart"], timeout=SQM_RESTART_TIMEOUT_SECONDS)
    if rc != 0:
        return ApplyResult(success=False, disk_committed=True, reason=f"sqm restart failed: {stderr or rc}")

    return ApplyResult(success=True, disk_committed=True)


def _ping_reachable(target: str) -> bool:
    """A target counts as reachable only if pings succeeded AND loss stays
    within MAX_ACCEPTABLE_LOSS_PERCENT — a config that lets through 1 of 5
    pings (80% loss) is not meaningfully "reachable," even though a bare
    success/fail check on the ping result would say it is.
    """
    result = probe_ping(target, count=DEFAULT_REACHABILITY_PING_COUNT, deadline=DEFAULT_REACHABILITY_DEADLINE)
    if not result.get("success", False):
        return False
    loss = result.get("loss_percent")
    return loss is not None and loss <= MAX_ACCEPTABLE_LOSS_PERCENT


def gateway_reachable(gateway: str) -> bool:
    return _ping_reachable(gateway)


def public_path_reachable(target: str) -> bool:
    return _ping_reachable(target)


@dataclass
class RollbackController:
    """Apply a new config with a verified, timed rollback to the old one.

    All side-effecting steps are injectable functions so this can be tested
    without real UCI/network access, and so the watchdog logic is provable
    in isolation from any dashboard or CLI wiring.

    Every rollback (immediate or timer-fired) verifies apply_config_fn's
    result on the OLD config before declaring success: _rolled_back is set
    only when the restore is confirmed; _rollback_failed is set if the
    restore attempt itself failed, so a caller can never mistake "we tried
    to roll back" for "the router is actually back on the known-good
    config."

    confirm() and the timer's rollback share a single lock around their
    check-then-act sequence (check _confirmed / _rolled_back, then mutate
    state) so the two can never race: whichever acquires the lock first
    makes the real decision, and the other side's check is guaranteed to
    observe that outcome rather than a stale read from a moment earlier.
    """

    old_config_path: Path
    new_config_path: Path
    gateway: str
    target: str
    confirm_timeout: int = DEFAULT_CONFIRM_TIMEOUT

    save_config_fn: Callable[[Path], bool] = save_sqm_config
    apply_config_fn: Callable[[Path], ApplyResult] = apply_sqm_config
    gateway_reachable_fn: Callable[[str], bool] = gateway_reachable
    public_reachable_fn: Callable[[str], bool] = public_path_reachable

    _rollback_timer: threading.Timer | None = field(default=None, init=False, repr=False)
    _confirmed: threading.Event = field(default_factory=threading.Event, init=False, repr=False)
    _rolled_back: threading.Event = field(default_factory=threading.Event, init=False, repr=False)
    _rollback_failed: threading.Event = field(default_factory=threading.Event, init=False, repr=False)
    _state_lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)

    def apply_with_rollback(self) -> str:
        """Apply the new config; verify it; arm a timed rollback if it passes."""
        if not self.save_config_fn(self.old_config_path):
            return "failed: could not save current configuration — refusing to apply an unrecoverable change"

        result = self.apply_config_fn(self.new_config_path)

        if not result.success and not result.disk_committed:
            # Nothing changed on disk — a clean, safe no-op failure.
            return f"failed: could not apply new configuration ({result.reason})"

        if not result.success and result.disk_committed:
            # The config WAS committed to disk even though the service
            # didn't come up cleanly (e.g. restart failed) — this needs
            # the same rollback treatment as a reachability failure, not
            # the "nothing happened" treatment above.
            return self._do_rollback(f"apply partially failed ({result.reason})")

        if not self.gateway_reachable_fn(self.gateway):
            return self._do_rollback("gateway unreachable")

        if not self.public_reachable_fn(self.target):
            return self._do_rollback("WAN unreachable")

        self._schedule_rollback()
        return "awaiting confirmation"

    def _do_rollback(self, reason: str) -> str:
        rollback_result = self.apply_config_fn(self.old_config_path)
        if rollback_result.success:
            self._rolled_back.set()
            return f"rollback: {reason} — previous configuration restored"
        self._rollback_failed.set()
        return (
            f"ROLLBACK FAILED: {reason}, and restoring the previous configuration "
            f"also failed ({rollback_result.reason}) — manual intervention required, "
            f"the router may be running the untested configuration"
        )

    def confirm(self) -> bool:
        """Cancel the pending rollback — the new configuration is kept.

        Returns False if a rollback already happened (or already failed)
        by the time this is called — too late to confirm.
        """
        with self._state_lock:
            if self._rolled_back.is_set() or self._rollback_failed.is_set():
                return False
            self._confirmed.set()
        if self._rollback_timer is not None:
            self._rollback_timer.cancel()
        return True

    def wait_for_outcome(self, extra: float = 0.5) -> None:
        """Block until the rollback timer fires or is cancelled (test helper)."""
        if self._rollback_timer is not None:
            time.sleep(self.confirm_timeout + extra)

    def _schedule_rollback(self) -> None:
        self._confirmed.clear()
        self._rolled_back.clear()
        self._rollback_failed.clear()
        self._rollback_timer = threading.Timer(self.confirm_timeout, self._rollback_if_unconfirmed)
        self._rollback_timer.daemon = True
        self._rollback_timer.start()

    def _rollback_if_unconfirmed(self) -> None:
        with self._state_lock:
            if self._confirmed.is_set():
                return
            # The actual rollback subprocess call happens while holding the
            # lock on purpose: a concurrent confirm() call must block until
            # this decision is final, so it correctly observes whichever
            # outcome actually won the race instead of a stale read.
            rollback_result = self.apply_config_fn(self.old_config_path)
            if rollback_result.success:
                self._rolled_back.set()
            else:
                self._rollback_failed.set()


def watch_confirm_file(
    confirm_file: Path,
    controller: RollbackController,
    poll_interval: float = 1.0,
) -> None:
    """Poll *confirm_file* for existence; call controller.confirm() when it appears.

    Runs in the calling thread — intended to be the main loop of a standalone
    `python -m probe.safety apply ...` process, independent of any dashboard.
    """
    while (
        not controller._confirmed.is_set()
        and not controller._rolled_back.is_set()
        and not controller._rollback_failed.is_set()
    ):
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
        if args.confirm_timeout < MIN_CONFIRM_TIMEOUT:
            print(
                f"error: --confirm-timeout must be at least {MIN_CONFIRM_TIMEOUT} seconds "
                f"(got {args.confirm_timeout}) — a shorter window doesn't leave a real chance to confirm",
                file=sys.stderr,
            )
            return 1

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

            if controller._confirmed.is_set():
                final = "confirmed: new configuration kept"
            elif controller._rollback_failed.is_set():
                final = (
                    "ROLLBACK FAILED: manual intervention required — "
                    "the router may still be running the untested configuration"
                )
            else:
                final = "rolled back: no confirmation received"
            print(f"[gateway-probe-safety] {final}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
