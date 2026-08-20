"""Tests for the observe-only controller policy."""

from __future__ import annotations

from probe.controller_policy import ControllerObservation, ControllerPolicyConfig, evaluate
from probe.controller_state import ControllerState
from probe.rate_estimator import EstimatorConfig, RateEstimate, ThroughputSample, estimate_rate


def _good_estimate(rate=50.0, baseline=45.0):
    samples = [
        ThroughputSample(
            direction="egress",
            throughput_mbit=rate,
            duration_seconds=10.0,
            packet_loss_percent=0.0,
            interface_name="eth0",
            route_identity="route-a",
            timestamp_monotonic_ns=i * 1_000_000_000,
        )
        for i in range(3)
    ]
    return estimate_rate(
        samples,
        direction="egress",
        expected_interface="eth0",
        expected_route_identity="route-a",
        last_confirmed_rate_mbit=baseline,
    )


def _call(*, estimate=None, sqm=False, complete=True, dwell=True, owned=False, state=ControllerState.OBSERVING, mode="observe_only"):
    if estimate is None:
        estimate = _good_estimate()
    config = ControllerPolicyConfig(mode=mode)
    return evaluate(
        current_state=state,
        config=config,
        estimate=estimate,
        qdisc_owned=owned,
        sqm_detected=sqm,
        report_complete=complete,
        dwell_elapsed=dwell,
    )


class TestFreezePassthrough:
    def test_frozen_state_returns_blocked(self):
        result = _call(state=ControllerState.FROZEN)
        assert result.state == ControllerState.FROZEN
        assert result.actuation_status == "blocked"
        assert result.transition is None


class TestEarlyBlocks:
    def test_sqm_detected_blocks(self):
        result = _call(sqm=True)
        assert result.actuation_status == "blocked"
        assert result.reason_code == "sqm_managed_qdisc"

    def test_incomplete_report_blocks(self):
        result = _call(complete=False)
        assert result.actuation_status == "blocked"
        assert result.reason_code == "report_incomplete"

    def test_insufficient_confidence_blocks(self):
        empty = estimate_rate([], direction="egress", expected_interface="eth0", expected_route_identity="route-a")
        result = _call(estimate=empty)
        assert result.reason_code == "insufficient_confidence"

    def test_no_baseline_blocks(self):
        samples = [
            ThroughputSample(
                direction="egress", throughput_mbit=50.0, duration_seconds=10.0,
                packet_loss_percent=0.0, interface_name="eth0", route_identity="route-a",
                timestamp_monotonic_ns=i * 1_000_000_000,
            )
            for i in range(3)
        ]
        est = estimate_rate(
            samples, direction="egress",
            expected_interface="eth0", expected_route_identity="route-a",
            last_confirmed_rate_mbit=None,
        )
        result = _call(estimate=est)
        assert result.reason_code == "no_confirmed_baseline"

    def test_dwell_active_blocks(self):
        result = _call(dwell=False)
        assert result.reason_code == "dwell_active"

    def test_below_threshold_blocks(self):
        est = _good_estimate(rate=45.5, baseline=45.0)
        result = _call(estimate=est)
        assert result.reason_code == "below_change_threshold"


class TestProposalReady:
    def test_all_conditions_met_returns_proposal_ready(self):
        result = _call()
        assert result.state == ControllerState.PROPOSAL_READY
        assert result.actuation_status == "blocked_pending_actuation_design_approval"
        assert result.recommendation_mbit is not None

    def test_controller_owned_mode_without_ownership_blocks(self):
        result = _call(mode="controller_owned_qdisc", owned=False)
        assert result.reason_code == "ownership_mismatch"
        assert result.actuation_status == "blocked"

    def test_controller_owned_mode_with_ownership_produces_proposal(self):
        result = _call(mode="controller_owned_qdisc", owned=True)
        assert result.state == ControllerState.PROPOSAL_READY
        assert result.actuation_status == "blocked_pending_actuation_design_approval"
