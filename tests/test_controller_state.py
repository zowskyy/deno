"""Tests for the observe-only state machine transition guard."""

from __future__ import annotations

import pytest

from probe.controller_state import ControllerState, is_actuation_state, transition


class TestLegalTransitions:
    def test_disabled_to_observe_only(self):
        t = transition(ControllerState.DISABLED, ControllerState.OBSERVE_ONLY, "startup")
        assert t.current == ControllerState.OBSERVE_ONLY

    def test_disabled_to_frozen(self):
        t = transition(ControllerState.DISABLED, ControllerState.FROZEN, "startup_error")
        assert t.current == ControllerState.FROZEN

    def test_observe_only_to_observing(self):
        t = transition(ControllerState.OBSERVE_ONLY, ControllerState.OBSERVING, "ready")
        assert t.current == ControllerState.OBSERVING

    def test_observing_to_proposal_ready(self):
        t = transition(ControllerState.OBSERVING, ControllerState.PROPOSAL_READY, "estimate_ready")
        assert t.current == ControllerState.PROPOSAL_READY

    def test_observing_to_observe_only(self):
        t = transition(ControllerState.OBSERVING, ControllerState.OBSERVE_ONLY, "sqm_detected")
        assert t.current == ControllerState.OBSERVE_ONLY

    def test_proposal_ready_to_observe_only(self):
        t = transition(ControllerState.PROPOSAL_READY, ControllerState.OBSERVE_ONLY, "no_actuation")
        assert t.current == ControllerState.OBSERVE_ONLY

    def test_proposal_ready_to_applying(self):
        t = transition(ControllerState.PROPOSAL_READY, ControllerState.APPLYING, "actuator_accepted")
        assert t.current == ControllerState.APPLYING

    def test_applying_to_pending_confirmation(self):
        t = transition(ControllerState.APPLYING, ControllerState.PENDING_CONFIRMATION, "tc_change_succeeded")
        assert t.current == ControllerState.PENDING_CONFIRMATION

    def test_applying_to_rolling_back(self):
        t = transition(ControllerState.APPLYING, ControllerState.ROLLING_BACK, "tc_change_failed")
        assert t.current == ControllerState.ROLLING_BACK

    def test_pending_confirmation_to_confirmed(self):
        t = transition(ControllerState.PENDING_CONFIRMATION, ControllerState.CONFIRMED, "no_regression")
        assert t.current == ControllerState.CONFIRMED

    def test_pending_confirmation_to_rolling_back(self):
        t = transition(ControllerState.PENDING_CONFIRMATION, ControllerState.ROLLING_BACK, "regression_detected")
        assert t.current == ControllerState.ROLLING_BACK

    def test_confirmed_to_cooldown(self):
        t = transition(ControllerState.CONFIRMED, ControllerState.COOLDOWN, "change_confirmed")
        assert t.current == ControllerState.COOLDOWN

    def test_rolling_back_to_cooldown(self):
        t = transition(ControllerState.ROLLING_BACK, ControllerState.COOLDOWN, "rollback_verified")
        assert t.current == ControllerState.COOLDOWN

    def test_cooldown_to_observing(self):
        t = transition(ControllerState.COOLDOWN, ControllerState.OBSERVING, "dwell_elapsed")
        assert t.current == ControllerState.OBSERVING

    def test_any_to_frozen(self):
        for state in (
            ControllerState.OBSERVE_ONLY,
            ControllerState.OBSERVING,
            ControllerState.PROPOSAL_READY,
            ControllerState.APPLYING,
            ControllerState.PENDING_CONFIRMATION,
            ControllerState.CONFIRMED,
            ControllerState.ROLLING_BACK,
            ControllerState.COOLDOWN,
        ):
            t = transition(state, ControllerState.FROZEN, "store_failure")
            assert t.current == ControllerState.FROZEN

    def test_frozen_to_observe_only(self):
        t = transition(ControllerState.FROZEN, ControllerState.OBSERVE_ONLY, "operator_cleared")
        assert t.current == ControllerState.OBSERVE_ONLY


class TestIllegalTransitions:
    def test_observe_only_to_proposal_ready_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.OBSERVE_ONLY, ControllerState.PROPOSAL_READY, "skip")

    def test_proposal_ready_to_observing_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.PROPOSAL_READY, ControllerState.OBSERVING, "skip")

    def test_frozen_to_observing_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.FROZEN, ControllerState.OBSERVING, "skip")

    def test_applying_to_confirmed_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.APPLYING, ControllerState.CONFIRMED, "skip")

    def test_pending_confirmation_to_cooldown_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.PENDING_CONFIRMATION, ControllerState.COOLDOWN, "skip")

    def test_cooldown_to_proposal_ready_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.COOLDOWN, ControllerState.PROPOSAL_READY, "skip")

    def test_confirmed_to_observing_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.CONFIRMED, ControllerState.OBSERVING, "skip")

    def test_empty_reason_code_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.OBSERVE_ONLY, ControllerState.OBSERVING, "")

    def test_too_long_reason_code_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.OBSERVE_ONLY, ControllerState.OBSERVING, "x" * 129)


class TestIsActuationState:
    def test_actuation_states_return_true(self):
        for state in (
            ControllerState.APPLYING,
            ControllerState.PENDING_CONFIRMATION,
            ControllerState.CONFIRMED,
            ControllerState.ROLLING_BACK,
            ControllerState.COOLDOWN,
        ):
            assert is_actuation_state(state)

    def test_non_actuation_states_return_false(self):
        for state in (
            ControllerState.DISABLED,
            ControllerState.OBSERVE_ONLY,
            ControllerState.OBSERVING,
            ControllerState.PROPOSAL_READY,
            ControllerState.FROZEN,
        ):
            assert not is_actuation_state(state)
