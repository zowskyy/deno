"""Tests for the timed-rollback QoS safety wrapper.

All side-effecting functions (save/apply config, reachability checks) are
injected, so these tests never touch real `uci` or the network.
"""

import time
from pathlib import Path

import pytest

from probe.safety import RollbackController


def _controller(tmp_path, confirm_timeout=0.15, **overrides):
    calls = {"applied": [], "saved": []}

    def save_config_fn(path):
        calls["saved"].append(path)

    def apply_config_fn(path):
        calls["applied"].append(path)
        return overrides.get("apply_result", True)

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


class TestApplyFailure:
    def test_apply_failure_returns_failed_and_skips_reachability_checks(self, tmp_path):
        controller, calls = _controller(tmp_path, apply_result=False)
        outcome = controller.apply_with_rollback()

        assert outcome == "failed: could not apply new configuration"
        # new config path attempted once, no rollback attempted
        assert calls["applied"] == [controller.new_config_path]


class TestGatewayUnreachable:
    def test_rolls_back_immediately_when_gateway_unreachable(self, tmp_path):
        controller, calls = _controller(tmp_path, gateway_reachable=False)
        outcome = controller.apply_with_rollback()

        assert outcome == "rollback: gateway unreachable"
        assert calls["applied"] == [controller.new_config_path, controller.old_config_path]
        assert calls["saved"] == [controller.old_config_path]


class TestPublicUnreachable:
    def test_rolls_back_immediately_when_wan_unreachable(self, tmp_path):
        controller, calls = _controller(tmp_path, public_reachable=False)
        outcome = controller.apply_with_rollback()

        assert outcome == "rollback: WAN unreachable"
        assert calls["applied"] == [controller.new_config_path, controller.old_config_path]


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

        controller.confirm()
        time.sleep(0.5)

        # only the new config was ever applied; no rollback occurred
        assert calls["applied"] == [controller.new_config_path]
        assert not controller._rolled_back.is_set()
        assert controller._confirmed.is_set()


class TestWatchConfirmFile:
    def test_watch_confirm_file_confirms_when_file_appears(self, tmp_path):
        controller, calls = _controller(tmp_path, confirm_timeout=5)
        controller.apply_with_rollback()

        confirm_file = tmp_path / "confirm"

        import threading

        from probe.safety import watch_confirm_file

        def touch_soon():
            time.sleep(0.05)
            confirm_file.touch()

        threading.Thread(target=touch_soon, daemon=True).start()
        watch_confirm_file(confirm_file, controller, poll_interval=0.02)

        assert controller._confirmed.is_set()
        assert not confirm_file.exists()  # consumed
        assert calls["applied"] == [controller.new_config_path]
