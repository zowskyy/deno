"""Observe-only controller decision policy.

Pure decision logic: given the current state, a rate estimate, and a set
of environmental facts (SQM presence, ownership, dwell), decides which
state transition to take next. This module never calls tc, never mutates
Netlink state, and never invokes the actuator — every code path returns
an actuation_status of "blocked" or "blocked_pending_actuation_design_approval".
Actuation itself is a separate, not-yet-approved design.
"""

from __future__ import annotations

from dataclasses import dataclass

from .controller_state import ControllerState, StateTransition, transition
from .rate_estimator import RateEstimate

_DEFAULT_MIN_ABSOLUTE_DELTA_MBIT = 2.0
_DEFAULT_MIN_RELATIVE_DELTA_PERCENT = 3.0
_DEFAULT_MIN_DWELL_SECONDS = 600


@dataclass(frozen=True)
class ControllerPolicyConfig:
    mode: str = "observe_only"
    min_absolute_delta_mbit: float = _DEFAULT_MIN_ABSOLUTE_DELTA_MBIT
    min_relative_delta_percent: float = _DEFAULT_MIN_RELATIVE_DELTA_PERCENT
    min_dwell_seconds: int = _DEFAULT_MIN_DWELL_SECONDS

    def __post_init__(self) -> None:
        if self.mode not in ("observe_only", "controller_owned_qdisc"):
            raise ValueError(f"unsupported mode: {self.mode!r}")


@dataclass(frozen=True)
class ControllerObservation:
    state: ControllerState
    reason_code: str
    actuation_status: str
    recommendation_mbit: float | None = None
    transition: StateTransition | None = None


def _blocked(
    *,
    current_state: ControllerState,
    reason_code: str,
) -> ControllerObservation:
    t = transition(current_state, ControllerState.OBSERVING, reason_code) \
        if current_state != ControllerState.OBSERVING else None
    return ControllerObservation(
        state=ControllerState.OBSERVING,
        reason_code=reason_code,
        actuation_status="blocked",
        transition=t,
    )


def evaluate(
    *,
    current_state: ControllerState,
    config: ControllerPolicyConfig,
    estimate: RateEstimate,
    qdisc_owned: bool,
    sqm_detected: bool,
    report_complete: bool,
    dwell_elapsed: bool,
) -> ControllerObservation:
    if current_state == ControllerState.FROZEN:
        return ControllerObservation(
            state=ControllerState.FROZEN,
            reason_code="frozen",
            actuation_status="blocked",
            transition=None,
        )

    if sqm_detected:
        return _blocked(current_state=current_state, reason_code="sqm_managed_qdisc")

    if not report_complete:
        return _blocked(current_state=current_state, reason_code="report_incomplete")

    if estimate.confidence == "insufficient" or estimate.bounded_rate_mbit is None:
        return _blocked(current_state=current_state, reason_code="insufficient_confidence")

    if estimate.proposed_delta_percent is None:
        return _blocked(current_state=current_state, reason_code="no_confirmed_baseline")

    if not dwell_elapsed:
        return _blocked(current_state=current_state, reason_code="dwell_active")

    absolute_delta = abs(estimate.bounded_rate_mbit * estimate.proposed_delta_percent / 100.0)
    if (
        absolute_delta < config.min_absolute_delta_mbit
        and abs(estimate.proposed_delta_percent) < config.min_relative_delta_percent
    ):
        return _blocked(current_state=current_state, reason_code="below_change_threshold")

    if config.mode == "controller_owned_qdisc" and not qdisc_owned:
        return _blocked(current_state=current_state, reason_code="ownership_mismatch")

    t = transition(current_state, ControllerState.PROPOSAL_READY, "estimate_ready")
    return ControllerObservation(
        state=ControllerState.PROPOSAL_READY,
        reason_code="estimate_ready",
        actuation_status="blocked_pending_actuation_design_approval",
        recommendation_mbit=estimate.bounded_rate_mbit,
        transition=t,
    )
