"""Tests for the observe-only state machine transition guard."""

from __future__ import annotations

import pytest

from probe.controller_state import ControllerState, transition


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

    def test_any_to_frozen(self):
        for state in (
            ControllerState.OBSERVE_ONLY,
            ControllerState.OBSERVING,
            ControllerState.PROPOSAL_READY,
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

    def test_empty_reason_code_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.OBSERVE_ONLY, ControllerState.OBSERVING, "")

    def test_too_long_reason_code_raises(self):
        with pytest.raises(ValueError):
            transition(ControllerState.OBSERVE_ONLY, ControllerState.OBSERVING, "x" * 129)
