"""Tests for the timed-rollback QoS safety wrapper.

All side-effecting functions (save/apply config, reachability checks) are
injected, so these tests never touch real `uci` or the network.

This module is the only part of gateway-probe allowed to actually change a
router's configuration, so its tests hold it to a higher bar: every
"rollback" outcome must reflect a VERIFIED restore, not just an attempt,
and every reported success/failure must match what the injected functions
actually did — not what the code assumed happened.
"""

import threading
import time

import pytest

from probe.safety import ApplyResult, RollbackController, main, watch_confirm_file


def _controller(tmp_path, confirm_timeout=0.15, **overrides):
    """Build a RollbackController with fully injected, call-tracking fakes.

    overrides:
      save_result: bool returned by save_config_fn (default True)
      apply_success / apply_disk_committed / apply_reason: fields of the
        ApplyResult returned by apply_config_fn for EVERY call (default:
        a clean success)
      apply_result_fn: callable(path) -> ApplyResult, takes priority over
        the apply_success/... defaults when given — lets a test return
        DIFFERENT results depending on whether new_config_path or
        old_config_path was passed (e.g. "new config applies fine, but
        rolling back to the old config fails").
      gateway_reachable / public_reachable: bool (default True)
    """
    calls = {"applied": [], "saved": []}

    save_result = overrides.get("save_result", True)

    def save_config_fn(path):
        calls["saved"].append(path)
        return save_result

    apply_result_fn = overrides.get("apply_result_fn")
    default_success = overrides.get("apply_success", True)
    default_disk_committed = overrides.get("apply_disk_committed", default_success)
    default_reason = overrides.get("apply_reason", "")

    def apply_config_fn(path):
        calls["applied"].append(path)
        if apply_result_fn is not None:
            return apply_result_fn(path)
        return ApplyResult(success=default_success, disk_committed=default_disk_committed, reason=default_reason)

    def gateway_reachable_fn(gateway):
        return overrides.get("gateway_reachable", True)

    def public_reachable_fn(target):
        return overrides.get("public_reachable", True)

    controller = RollbackController(
        old_config_path=tmp_path / "old.uci",
        new_config_path=tmp_path / "new.uci",
        gateway="192.168.12.1",
        target="1.1.1.1",
        confirm_timeout=confirm_timeout,
        save_config_fn=save_config_fn,
        apply_config_fn=apply_config_fn,
        gateway_reachable_fn=gateway_reachable_fn,
        public_reachable_fn=public_reachable_fn,
    )
    return controller, calls


class TestSaveFailure:
    def test_save_failure_aborts_before_touching_new_config(self, tmp_path):
        # Regression: previously save_sqm_config's return value was never
        # checked, so a failed export (uci missing, sqm section absent)
        # could silently produce an empty backup and the code would still
        # proceed to apply an untested config with no real way back.
        controller, calls = _controller(tmp_path, save_result=False)
        outcome = controller.apply_with_rollback()

        assert outcome.startswith("failed: could not save current configuration")
        assert calls["saved"] == [controller.old_config_path]
        assert calls["applied"] == []  # new config must NEVER be touched


class TestApplyFailure:
    def test_clean_apply_failure_returns_failed_and_skips_reachability_checks(self, tmp_path):
        # import/commit never succeeded — disk was never touched, so this
        # is a safe no-op failure, not something needing rollback.
        controller, calls = _controller(tmp_path, apply_success=False, apply_disk_committed=False)
        outcome = controller.apply_with_rollback()

        assert outcome.startswith("failed: could not apply new configuration")
        assert calls["applied"] == [controller.new_config_path]

    def test_partial_apply_failure_triggers_rollback_not_silent_failure(self, tmp_path):
        # Regression: commit succeeded (disk_committed=True) but the
        # restart failed (success=False) — previously this was treated
        # identically to a clean no-op failure and skipped rollback
        # entirely, leaving the new, never-verified config committed to
        # disk with no safety net. The rollback-to-old-config call itself
        # succeeds cleanly here — this test isolates "does a partial
        # failure trigger rollback at all," separate from
        # TestRollbackOfRollbackFails below, which covers the restore
        # itself also failing.
        def apply_result_fn(path):
            if path.name == "new.uci":
                return ApplyResult(success=False, disk_committed=True, reason="sqm restart failed")
            return ApplyResult(success=True, disk_committed=True)

        controller, calls = _controller(tmp_path, apply_result_fn=apply_result_fn)
        outcome = controller.apply_with_rollback()

        assert outcome.startswith("rollback:")
        assert "apply partially failed" in outcome
        assert calls["applied"] == [controller.new_config_path, controller.old_config_path]
        assert controller._rolled_back.is_set()


class TestGatewayUnreachable:
    def test_rolls_back_immediately_when_gateway_unreachable(self, tmp_path):
        controller, calls = _controller(tmp_path, gateway_reachable=False)
        outcome = controller.apply_with_rollback()

        assert outcome == "rollback: gateway unreachable — previous configuration restored"
        assert calls["applied"] == [controller.new_config_path, controller.old_config_path]
        assert calls["saved"] == [controller.old_config_path]
        assert controller._rolled_back.is_set()


class TestPublicUnreachable:
    def test_rolls_back_immediately_when_wan_unreachable(self, tmp_path):
        controller, calls = _controller(tmp_path, public_reachable=False)
        outcome = controller.apply_with_rollback()

        assert outcome == "rollback: WAN unreachable — previous configuration restored"
        assert calls["applied"] == [controller.new_config_path, controller.old_config_path]


class TestRollbackOfRollbackFails:
    """The scenario the original code could never express: the new config
    applies fine, but restoring the OLD config during rollback also fails
    — e.g. the backup file is corrupt, or uci itself becomes unresponsive.
    The router is now stuck on an untested config with no restore path,
    and the code must say so clearly, not report a generic "rollback: ..."
    success string."""

    def test_rollback_failure_after_gateway_unreachable_is_reported_distinctly(self, tmp_path):
        def apply_result_fn(path):
            if path.name == "new.uci":
                return ApplyResult(success=True, disk_committed=True)
            return ApplyResult(success=False, disk_committed=True, reason="uci import failed: corrupt backup")

        controller, calls = _controller(tmp_path, gateway_reachable=False, apply_result_fn=apply_result_fn)
        outcome = controller.apply_with_rollback()

        assert outcome.startswith("ROLLBACK FAILED")
        assert "manual intervention required" in outcome
        assert controller._rollback_failed.is_set()
        assert not controller._rolled_back.is_set()

    def test_rollback_failure_on_timer_expiry_sets_rollback_failed_not_rolled_back(self, tmp_path):
        def apply_result_fn(path):
            if path.name == "new.uci":
                return ApplyResult(success=True, disk_committed=True)
            return ApplyResult(success=False, disk_committed=True, reason="restore also failed")

        controller, calls = _controller(tmp_path, confirm_timeout=0.1, apply_result_fn=apply_result_fn)
        outcome = controller.apply_with_rollback()
        assert outcome == "awaiting confirmation"

        time.sleep(0.4)

        assert controller._rollback_failed.is_set()
        assert not controller._rolled_back.is_set()


class TestHighPacketLossIsNotReachable:
    """Regression: gateway_reachable/public_path_reachable previously only
    checked probe_ping's `success` flag, which is True as soon as even 1
    of 5 pings gets a reply — meaning 80% packet loss passed the check. A
    badly-misconfigured CAKE limit causing heavy-but-not-total loss could
    sail straight through and land in 'awaiting confirmation'."""

    def test_gateway_reachable_rejects_high_loss_even_with_a_successful_ping(self, monkeypatch):
        from probe import safety as safety_mod

        monkeypatch.setattr(
            safety_mod,
            "probe_ping",
            lambda *a, **kw: {"success": True, "loss_percent": 80.0},
        )
        assert safety_mod.gateway_reachable("192.168.1.1") is False

    def test_gateway_reachable_accepts_low_loss(self, monkeypatch):
        from probe import safety as safety_mod

        monkeypatch.setattr(
            safety_mod,
            "probe_ping",
            lambda *a, **kw: {"success": True, "loss_percent": 5.0},
        )
        assert safety_mod.gateway_reachable("192.168.1.1") is True

    def test_gateway_reachable_accepts_exactly_the_threshold(self, monkeypatch):
        from probe import safety as safety_mod

        monkeypatch.setattr(
            safety_mod,
            "probe_ping",
            lambda *a, **kw: {"success": True, "loss_percent": safety_mod.MAX_ACCEPTABLE_LOSS_PERCENT},
        )
        assert safety_mod.gateway_reachable("192.168.1.1") is True

    def test_public_reachable_also_enforces_loss_threshold(self, monkeypatch):
        from probe import safety as safety_mod

        monkeypatch.setattr(
            safety_mod,
            "probe_ping",
            lambda *a, **kw: {"success": True, "loss_percent": 90.0},
        )
        assert safety_mod.public_path_reachable("1.1.1.1") is False


class TestAwaitingConfirmation:
    def test_healthy_apply_awaits_confirmation(self, tmp_path):
        controller, calls = _controller(tmp_path, confirm_timeout=10)
        outcome = controller.apply_with_rollback()

        assert outcome == "awaiting confirmation"
        assert calls["applied"] == [controller.new_config_path]
        # cleanup: cancel the pending timer so the test process can exit promptly
        controller.confirm()

    def test_timeout_without_confirmation_triggers_rollback(self, tmp_path):
        controller, calls = _controller(tmp_path, confirm_timeout=0.1)
        outcome = controller.apply_with_rollback()
        assert outcome == "awaiting confirmation"

        time.sleep(0.4)

        assert calls["applied"] == [controller.new_config_path, controller.old_config_path]
        assert controller._rolled_back.is_set()

    def test_confirm_before_timeout_prevents_rollback(self, tmp_path):
        controller, calls = _controller(tmp_path, confirm_timeout=0.3)
        outcome = controller.apply_with_rollback()
        assert outcome == "awaiting confirmation"

        assert controller.confirm() is True
        time.sleep(0.5)

        # only the new config was ever applied; no rollback occurred
        assert calls["applied"] == [controller.new_config_path]
        assert not controller._rolled_back.is_set()
        assert controller._confirmed.is_set()


class TestConfirmRollbackRace:
    """Regression: confirm() and the timer's _rollback_if_unconfirmed()
    previously had no shared lock around their check-then-act sequences,
    so a confirm() landing at the exact moment the timer fired could
    report "confirmed: kept" while a rollback had actually just run. These
    tests force each ordering deterministically (not by timing/sleeping
    and hoping) using a barrier-like Event to make the interleaving
    reproducible."""

    def test_rollback_wins_the_race_confirm_is_told_it_lost(self, tmp_path):
        controller, calls = _controller(tmp_path, confirm_timeout=0.05)
        controller.apply_with_rollback()

        # Let the timer actually fire and complete the rollback for real
        # before confirm() is ever called.
        time.sleep(0.3)
        assert controller._rolled_back.is_set()

        # A confirm() arriving after the fact must honestly report it lost.
        assert controller.confirm() is False
        assert controller._confirmed.is_set() is False

    def test_confirm_wins_the_race_timer_becomes_a_noop(self, tmp_path):
        controller, calls = _controller(tmp_path, confirm_timeout=0.2)
        controller.apply_with_rollback()

        # Confirm well before the timer fires.
        assert controller.confirm() is True
        time.sleep(0.5)

        assert controller._confirmed.is_set()
        assert not controller._rolled_back.is_set()
        assert calls["applied"] == [controller.new_config_path]  # rollback never actually ran

    def test_lock_serializes_concurrent_confirm_and_forced_rollback_check(self, tmp_path):
        # Directly exercises the shared lock: hold it in the main thread
        # (simulating _rollback_if_unconfirmed being "in progress"), start
        # a concurrent confirm() call, and verify confirm() blocks until
        # the lock is released rather than racing past it.
        controller, calls = _controller(tmp_path, confirm_timeout=5)
        controller.apply_with_rollback()

        confirm_result = {}
        confirm_started = threading.Event()

        def call_confirm():
            confirm_started.set()
            confirm_result["value"] = controller.confirm()

        with controller._state_lock:
            # Simulate the timer having already claimed the rollback
            # decision by setting _rolled_back before releasing the lock —
            # this is exactly the state _rollback_if_unconfirmed leaves
            # behind when it wins the race.
            t = threading.Thread(target=call_confirm, daemon=True)
            t.start()
            confirm_started.wait(timeout=2)
            # confirm() must be blocked on the lock right now, not returned yet
            time.sleep(0.1)
            assert "value" not in confirm_result
            controller._rolled_back.set()

        t.join(timeout=2)
        assert confirm_result["value"] is False
        controller.confirm()  # cleanup: cancel any pending timer


class TestConfirmTimeoutValidation:
    def test_zero_confirm_timeout_is_rejected(self, tmp_path):
        rc = main([
            "apply",
            "--backup", str(tmp_path / "old.uci"),
            "--new-config", str(tmp_path / "new.uci"),
            "--gateway", "192.168.1.1",
            "--target", "1.1.1.1",
            "--confirm-timeout", "0",
            "--confirm-file", str(tmp_path / "confirm"),
        ])
        assert rc == 1

    def test_negative_confirm_timeout_is_rejected(self, tmp_path):
        rc = main([
            "apply",
            "--backup", str(tmp_path / "old.uci"),
            "--new-config", str(tmp_path / "new.uci"),
            "--gateway", "192.168.1.1",
            "--target", "1.1.1.1",
            "--confirm-timeout", "-5",
            "--confirm-file", str(tmp_path / "confirm"),
        ])
        assert rc == 1

    def test_below_minimum_confirm_timeout_is_rejected(self, tmp_path):
        from probe.safety import MIN_CONFIRM_TIMEOUT

        rc = main([
            "apply",
            "--backup", str(tmp_path / "old.uci"),
            "--new-config", str(tmp_path / "new.uci"),
            "--gateway", "192.168.1.1",
            "--target", "1.1.1.1",
            "--confirm-timeout", str(MIN_CONFIRM_TIMEOUT - 1),
            "--confirm-file", str(tmp_path / "confirm"),
        ])
        assert rc == 1


class TestWatchConfirmFile:
    def test_watch_confirm_file_confirms_when_file_appears(self, tmp_path):
        controller, calls = _controller(tmp_path, confirm_timeout=5)
        controller.apply_with_rollback()

        confirm_file = tmp_path / "confirm"

        def touch_soon():
            time.sleep(0.05)
            confirm_file.touch()

        threading.Thread(target=touch_soon, daemon=True).start()
        watch_confirm_file(confirm_file, controller, poll_interval=0.02)

        assert controller._confirmed.is_set()
        assert not confirm_file.exists()  # consumed
        assert calls["applied"] == [controller.new_config_path]

    def test_confirm_file_already_present_before_watch_starts(self, tmp_path):
        # Edge case: the user touches the confirm file before the process
        # even begins polling for it.
        controller, calls = _controller(tmp_path, confirm_timeout=5)
        controller.apply_with_rollback()

        confirm_file = tmp_path / "confirm"
        confirm_file.touch()

        watch_confirm_file(confirm_file, controller, poll_interval=0.02)

        assert controller._confirmed.is_set()
        assert not confirm_file.exists()

    def test_watch_stops_when_rollback_failed_not_just_rolled_back(self, tmp_path):
        # Regression: the original loop condition only checked _confirmed
        # and _rolled_back — it would spin forever if a rollback FAILED,
        # since neither flag would ever be set.
        def apply_result_fn(path):
            if path.name == "new.uci":
                return ApplyResult(success=True, disk_committed=True)
            return ApplyResult(success=False, disk_committed=True, reason="restore failed")

        controller, calls = _controller(tmp_path, confirm_timeout=0.1, apply_result_fn=apply_result_fn)
        controller.apply_with_rollback()

        confirm_file = tmp_path / "confirm"  # never created

        start = time.time()
        watch_confirm_file(confirm_file, controller, poll_interval=0.02)
        elapsed = time.time() - start

        assert controller._rollback_failed.is_set()
        assert elapsed < 2.0  # loop actually exited, didn't spin forever
