"""Observe-only controller state machine transition guard.

Enforces the legal transition graph for the v1.0 controller. Actuation
states (APPLYING, PENDING_CONFIRMATION, CONFIRMED, ROLLING_BACK, COOLDOWN)
are deliberately not modeled here yet — they are introduced only once the
actuation design is approved. This module governs the observe-only subset
of the state machine described in the plan.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ControllerState(StrEnum):
    DISABLED = "disabled"
    OBSERVE_ONLY = "observe_only"
    OBSERVING = "observing"
    PROPOSAL_READY = "proposal_ready"
    FROZEN = "frozen"


_ALLOWED: dict[ControllerState, set[ControllerState]] = {
    ControllerState.DISABLED: {ControllerState.OBSERVE_ONLY, ControllerState.FROZEN},
    ControllerState.OBSERVE_ONLY: {ControllerState.OBSERVING, ControllerState.FROZEN},
    ControllerState.OBSERVING: {
        ControllerState.PROPOSAL_READY,
        ControllerState.OBSERVE_ONLY,
        ControllerState.FROZEN,
    },
    ControllerState.PROPOSAL_READY: {ControllerState.OBSERVE_ONLY, ControllerState.FROZEN},
    ControllerState.FROZEN: {ControllerState.OBSERVE_ONLY},
}

_MAX_REASON_CODE_LENGTH = 128


@dataclass(frozen=True)
class StateTransition:
    previous: ControllerState
    current: ControllerState
    reason_code: str


def transition(
    previous: ControllerState, desired: ControllerState, reason_code: str
) -> StateTransition:
    """Attempt a state transition, raising ValueError if illegal."""
    if not reason_code or len(reason_code) > _MAX_REASON_CODE_LENGTH:
        raise ValueError(
            f"reason_code must be non-empty and <= {_MAX_REASON_CODE_LENGTH} chars"
        )
    if desired not in _ALLOWED.get(previous, set()):
        raise ValueError(f"illegal transition {previous!r} -> {desired!r}")
    return StateTransition(previous=previous, current=desired, reason_code=reason_code)


def move_or_hold(
    previous: ControllerState, desired: ControllerState, reason_code: str
) -> StateTransition:
    """Attempt the desired transition; on failure fall back to OBSERVE_ONLY.

    Never falls back when the desired state itself is FROZEN — a freeze
    request must always take effect.
    """
    try:
        return transition(previous, desired, reason_code)
    except ValueError:
        if desired == ControllerState.FROZEN:
            raise
        return transition(previous, ControllerState.OBSERVE_ONLY, reason_code)
