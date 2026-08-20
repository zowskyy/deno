"""Pure rate estimator: EMA + confidence + rejection logic.

No I/O, no actuation. Given a sequence of throughput samples, produces a
structured estimate with an explicit confidence level and the reasons any
sample was rejected. Callers (the controller) decide what to do with the
result; this module never mutates anything.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Direction = Literal["ingress", "egress"]
Confidence = Literal["insufficient", "low", "medium", "high"]
IperfStatus = Literal["complete", "timeout", "malformed", "server_refused"]


@dataclass(frozen=True)
class ThroughputSample:
    """A single measurement report, prior to acceptance filtering."""

    direction: Direction
    throughput_mbit: float | None
    duration_seconds: float
    packet_loss_percent: float | None
    interface_name: str
    route_identity: str
    timestamp_monotonic_ns: int
    complete: bool = True
    stale: bool = False
    pending_change: bool = False
    iperf_status: IperfStatus = "complete"


@dataclass(frozen=True)
class EstimatorConfig:
    """Bounds and thresholds governing sample acceptance and EMA."""

    alpha: float = 0.20
    min_valid_samples: int = 3
    min_duration_seconds: float = 5.0
    max_packet_loss_percent: float = 5.0
    min_rate_mbit: float = 0.1
    max_rate_mbit: float = 10_000.0

    def __post_init__(self) -> None:
        if not (0.10 <= self.alpha <= 0.30):
            raise ValueError(f"alpha must be within 0.10-0.30, got {self.alpha}")
        if self.min_valid_samples < 3:
            raise ValueError(f"min_valid_samples must be >= 3, got {self.min_valid_samples}")
        if self.min_rate_mbit >= self.max_rate_mbit:
            raise ValueError(
                f"min_rate_mbit ({self.min_rate_mbit}) must be < max_rate_mbit ({self.max_rate_mbit})"
            )


@dataclass(frozen=True)
class RateEstimate:
    """Result of estimate_rate(): a confidence-qualified rate, never a bare scalar."""

    direction: Direction
    rate_mbit: float | None
    bounded_rate_mbit: float | None
    accepted_sample_count: int
    rejected_sample_count: int
    confidence: Confidence
    rejected_reasons: tuple[str, ...] = field(default_factory=tuple)
    proposed_delta_percent: float | None = None


def _sample_reasons(
    sample: ThroughputSample,
    *,
    direction: Direction,
    expected_interface: str,
    expected_route_identity: str,
    config: EstimatorConfig,
) -> tuple[str, ...]:
    reasons: list[str] = []

    if sample.direction != direction:
        return ("direction_mismatch",)

    if not sample.complete:
        reasons.append("report_partial")
    if sample.stale:
        reasons.append("report_stale")
    if sample.pending_change:
        reasons.append("pending_change")

    if sample.throughput_mbit is None:
        reasons.append("throughput_missing")
    elif sample.throughput_mbit <= 0:
        reasons.append("throughput_nonpositive")

    if sample.duration_seconds < config.min_duration_seconds:
        reasons.append("duration_too_short")

    if sample.packet_loss_percent is None:
        reasons.append("loss_missing")
    elif sample.packet_loss_percent > config.max_packet_loss_percent:
        reasons.append("loss_too_high")

    if sample.interface_name != expected_interface:
        reasons.append("interface_mismatch")
    if sample.route_identity != expected_route_identity:
        reasons.append("route_mismatch")

    if sample.iperf_status == "timeout":
        reasons.append("iperf_timeout")
    elif sample.iperf_status == "malformed":
        reasons.append("iperf_malformed")
    elif sample.iperf_status == "server_refused":
        reasons.append("iperf_server_refused")

    return tuple(reasons)


def estimate_rate(
    samples: list[ThroughputSample],
    *,
    direction: Direction,
    expected_interface: str,
    expected_route_identity: str,
    config: EstimatorConfig | None = None,
    last_confirmed_rate_mbit: float | None = None,
) -> RateEstimate:
    """Compute a chronological EMA over accepted samples for one direction.

    Samples for the other direction are silently ignored (not counted as
    rejections) — direction separation is a partition, not a filter.
    """
    if config is None:
        config = EstimatorConfig()

    accepted: list[ThroughputSample] = []
    all_reasons: list[str] = []

    for sample in samples:
        reasons = _sample_reasons(
            sample,
            direction=direction,
            expected_interface=expected_interface,
            expected_route_identity=expected_route_identity,
            config=config,
        )
        if reasons == ("direction_mismatch",):
            continue
        if reasons:
            all_reasons.extend(reasons)
            continue
        accepted.append(sample)

    accepted.sort(key=lambda s: s.timestamp_monotonic_ns)
    accepted_count = len(accepted)

    if accepted_count < config.min_valid_samples:
        return RateEstimate(
            direction=direction,
            rate_mbit=None,
            bounded_rate_mbit=None,
            accepted_sample_count=accepted_count,
            rejected_sample_count=len(samples) - accepted_count,
            confidence="insufficient",
            rejected_reasons=tuple(all_reasons),
        )

    ema = accepted[0].throughput_mbit
    for sample in accepted[1:]:
        ema = config.alpha * sample.throughput_mbit + (1 - config.alpha) * ema

    bounded = max(config.min_rate_mbit, min(config.max_rate_mbit, ema))

    if accepted_count >= 8:
        confidence: Confidence = "high"
    elif accepted_count >= 5:
        confidence = "medium"
    else:
        confidence = "low"

    proposed_delta_percent = None
    if last_confirmed_rate_mbit is not None and last_confirmed_rate_mbit > 0:
        proposed_delta_percent = (bounded - last_confirmed_rate_mbit) / last_confirmed_rate_mbit * 100.0

    return RateEstimate(
        direction=direction,
        rate_mbit=ema,
        bounded_rate_mbit=bounded,
        accepted_sample_count=accepted_count,
        rejected_sample_count=len(samples) - accepted_count,
        confidence=confidence,
        rejected_reasons=tuple(all_reasons),
        proposed_delta_percent=proposed_delta_percent,
    )
