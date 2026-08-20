"""Controller state machine transition guard.

Covers both the observe-only subset (DISABLED, OBSERVE_ONLY, OBSERVING,
PROPOSAL_READY, FROZEN) and the actuation extension approved in
docs/architecture/actuation-design.md (APPLYING, PENDING_CONFIRMATION,
CONFIRMED, ROLLING_BACK, COOLDOWN). FROZEN remains reachable from any
state and is a one-way trap except for the explicit operator-cleared
FROZEN -> OBSERVE_ONLY transition.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ControllerState(StrEnum):
    DISABLED = "disabled"
    OBSERVE_ONLY = "observe_only"
    OBSERVING = "observing"
    PROPOSAL_READY = "proposal_ready"
    APPLYING = "applying"
    PENDING_CONFIRMATION = "pending_confirmation"
    CONFIRMED = "confirmed"
    ROLLING_BACK = "rolling_back"
    COOLDOWN = "cooldown"
    FROZEN = "frozen"


_ACTUATION_STATES = (
    ControllerState.APPLYING,
    ControllerState.PENDING_CONFIRMATION,
    ControllerState.CONFIRMED,
    ControllerState.ROLLING_BACK,
    ControllerState.COOLDOWN,
)

_ALLOWED: dict[ControllerState, set[ControllerState]] = {
    ControllerState.DISABLED: {ControllerState.OBSERVE_ONLY, ControllerState.FROZEN},
    ControllerState.OBSERVE_ONLY: {ControllerState.OBSERVING, ControllerState.FROZEN},
    ControllerState.OBSERVING: {
        ControllerState.PROPOSAL_READY,
        ControllerState.OBSERVE_ONLY,
        ControllerState.FROZEN,
    },
    ControllerState.PROPOSAL_READY: {
        ControllerState.APPLYING,
        ControllerState.OBSERVE_ONLY,
        ControllerState.FROZEN,
    },
    ControllerState.APPLYING: {
        ControllerState.PENDING_CONFIRMATION,
        ControllerState.ROLLING_BACK,
        ControllerState.FROZEN,
    },
    ControllerState.PENDING_CONFIRMATION: {
        ControllerState.CONFIRMED,
        ControllerState.ROLLING_BACK,
        ControllerState.FROZEN,
    },
    ControllerState.CONFIRMED: {ControllerState.COOLDOWN, ControllerState.FROZEN},
    ControllerState.ROLLING_BACK: {ControllerState.COOLDOWN, ControllerState.FROZEN},
    ControllerState.COOLDOWN: {ControllerState.OBSERVING, ControllerState.FROZEN},
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


def is_actuation_state(state: ControllerState) -> bool:
    """True for states that only exist while an actuation is in flight."""
    return state in _ACTUATION_STATES


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
