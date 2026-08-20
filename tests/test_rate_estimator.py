"""Tests for the pure rate estimator (no I/O, no actuation)."""

from __future__ import annotations

import pytest

from probe.rate_estimator import (
    EstimatorConfig,
    RateEstimate,
    ThroughputSample,
    estimate_rate,
)


def _sample(
    direction="egress",
    throughput_mbit=50.0,
    duration_seconds=10.0,
    packet_loss_percent=0.0,
    interface_name="eth0",
    route_identity="route-a",
    timestamp_monotonic_ns=1_000_000_000,
    complete=True,
    stale=False,
    pending_change=False,
    iperf_status="complete",
):
    return ThroughputSample(
        direction=direction,
        throughput_mbit=throughput_mbit,
        duration_seconds=duration_seconds,
        packet_loss_percent=packet_loss_percent,
        interface_name=interface_name,
        route_identity=route_identity,
        timestamp_monotonic_ns=timestamp_monotonic_ns,
        complete=complete,
        stale=stale,
        pending_change=pending_change,
        iperf_status=iperf_status,
    )


def _three_valid(base_ns=0, **kwargs):
    return [
        _sample(timestamp_monotonic_ns=base_ns + i * 1_000_000_000, **kwargs)
        for i in range(3)
    ]


class TestEstimatorConfigValidation:
    def test_alpha_below_range_raises(self):
        with pytest.raises(ValueError, match="alpha"):
            EstimatorConfig(alpha=0.09)

    def test_alpha_above_range_raises(self):
        with pytest.raises(ValueError, match="alpha"):
            EstimatorConfig(alpha=0.31)

    def test_alpha_at_boundaries_accepted(self):
        EstimatorConfig(alpha=0.10)
        EstimatorConfig(alpha=0.30)

    def test_min_valid_samples_below_3_raises(self):
        with pytest.raises(ValueError):
            EstimatorConfig(min_valid_samples=2)

    def test_invalid_rate_bounds_raise(self):
        with pytest.raises(ValueError):
            EstimatorConfig(min_rate_mbit=100.0, max_rate_mbit=50.0)


class TestSampleRejection:
    def _call(self, samples, **kwargs):
        return estimate_rate(
            samples,
            direction="egress",
            expected_interface="eth0",
            expected_route_identity="route-a",
            **kwargs,
        )

    def test_no_samples_returns_insufficient(self):
        result = self._call([])
        assert result.confidence == "insufficient"
        assert result.rate_mbit is None

    def test_single_sample_returns_insufficient(self):
        result = self._call([_sample()])
        assert result.confidence == "insufficient"

    def test_partial_report_rejected(self):
        samples = _three_valid() + [_sample(complete=False)]
        result = self._call(samples)
        assert "report_partial" in result.rejected_reasons

    def test_stale_report_rejected(self):
        samples = _three_valid() + [_sample(stale=True)]
        result = self._call(samples)
        assert "report_stale" in result.rejected_reasons

    def test_pending_change_rejected(self):
        samples = _three_valid() + [_sample(pending_change=True)]
        result = self._call(samples)
        assert "pending_change" in result.rejected_reasons

    def test_missing_throughput_rejected(self):
        result = self._call(_three_valid(throughput_mbit=None))
        assert "throughput_missing" in result.rejected_reasons

    def test_zero_throughput_rejected(self):
        result = self._call(_three_valid(throughput_mbit=0.0))
        assert "throughput_nonpositive" in result.rejected_reasons

    def test_short_duration_rejected(self):
        result = self._call(_three_valid(duration_seconds=3.0))
        assert "duration_too_short" in result.rejected_reasons

    def test_high_loss_rejected(self):
        result = self._call(_three_valid(packet_loss_percent=10.0))
        assert "loss_too_high" in result.rejected_reasons

    def test_missing_loss_rejected(self):
        result = self._call(_three_valid(packet_loss_percent=None))
        assert "loss_missing" in result.rejected_reasons

    def test_interface_mismatch_rejected(self):
        result = self._call(_three_valid(interface_name="eth1"))
        assert "interface_mismatch" in result.rejected_reasons

    def test_route_mismatch_rejected(self):
        result = self._call(_three_valid(route_identity="route-b"))
        assert "route_mismatch" in result.rejected_reasons

    def test_iperf_timeout_rejected(self):
        result = self._call(_three_valid(iperf_status="timeout"))
        assert "iperf_timeout" in result.rejected_reasons

    def test_iperf_malformed_rejected(self):
        result = self._call(_three_valid(iperf_status="malformed"))
        assert "iperf_malformed" in result.rejected_reasons

    def test_iperf_server_refused_rejected(self):
        result = self._call(_three_valid(iperf_status="server_refused"))
        assert "iperf_server_refused" in result.rejected_reasons

    def test_wrong_direction_samples_are_ignored(self):
        ingress = _three_valid(direction="ingress")
        result = self._call(ingress)
        assert result.confidence == "insufficient"
        assert result.accepted_sample_count == 0


class TestEMAAndConfidence:
    def _call(self, samples, **kwargs):
        return estimate_rate(
            samples,
            direction="egress",
            expected_interface="eth0",
            expected_route_identity="route-a",
            **kwargs,
        )

    def test_three_samples_gives_low_confidence(self):
        result = self._call(_three_valid())
        assert result.confidence == "low"
        assert result.rate_mbit is not None

    def test_five_samples_gives_medium_confidence(self):
        samples = [
            _sample(timestamp_monotonic_ns=i * 1_000_000_000)
            for i in range(5)
        ]
        result = self._call(samples)
        assert result.confidence == "medium"

    def test_eight_samples_gives_high_confidence(self):
        samples = [
            _sample(timestamp_monotonic_ns=i * 1_000_000_000)
            for i in range(8)
        ]
        result = self._call(samples)
        assert result.confidence == "high"

    def test_ingress_and_egress_are_independent(self):
        egress = [
            _sample(direction="egress", throughput_mbit=100.0, timestamp_monotonic_ns=i * 1_000_000_000)
            for i in range(3)
        ]
        ingress = [
            _sample(direction="ingress", throughput_mbit=20.0, timestamp_monotonic_ns=i * 1_000_000_000)
            for i in range(3)
        ]
        egress_result = estimate_rate(
            egress + ingress, direction="egress",
            expected_interface="eth0", expected_route_identity="route-a",
        )
        ingress_result = estimate_rate(
            egress + ingress, direction="ingress",
            expected_interface="eth0", expected_route_identity="route-a",
        )
        assert egress_result.rate_mbit > ingress_result.rate_mbit

    def test_bounds_clamp_ema(self):
        config = EstimatorConfig(min_rate_mbit=10.0, max_rate_mbit=80.0)
        samples = _three_valid(throughput_mbit=200.0)
        result = self._call(samples, config=config)
        assert result.bounded_rate_mbit == 80.0

    def test_proposed_delta_percent_relative_to_baseline(self):
        samples = _three_valid(throughput_mbit=60.0)
        result = self._call(samples, last_confirmed_rate_mbit=50.0)
        assert result.proposed_delta_percent is not None
        assert result.proposed_delta_percent > 0


class TestSeparateDirectionEstimates:
    def test_no_cross_direction_contamination(self):
        samples = [
            _sample(direction="egress", throughput_mbit=90.0, timestamp_monotonic_ns=i * 1_000_000_000)
            for i in range(3)
        ] + [
            _sample(direction="ingress", throughput_mbit=10.0, timestamp_monotonic_ns=i * 1_000_000_000)
            for i in range(3)
        ]
        egress = estimate_rate(
            samples, direction="egress",
            expected_interface="eth0", expected_route_identity="route-a",
        )
        ingress = estimate_rate(
            samples, direction="ingress",
            expected_interface="eth0", expected_route_identity="route-a",
        )
        assert egress.accepted_sample_count == 3
        assert ingress.accepted_sample_count == 3
        assert egress.rate_mbit != ingress.rate_mbit
