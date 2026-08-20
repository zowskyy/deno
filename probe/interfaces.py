"""WAN interface state collection."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .shell import run_command as _run

CounterAvailability = Literal["present", "unavailable", "malformed"]


@dataclass(frozen=True)
class InterfaceCounters:
    """A single sysfs counter value with its availability state.

    ``value`` is None whenever ``availability`` is not "present" — the
    no-silent-zero rule: a missing or malformed counter must never be
    reported as 0, since 0 is itself a meaningful (error-free) value.
    """

    value: int | None
    availability: CounterAvailability


def _read_sys(path: str) -> str | None:
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def _read_counter(path: str) -> tuple[int | None, CounterAvailability]:
    raw = _read_sys(path)
    if raw is None:
        return None, "unavailable"
    try:
        value = int(raw)
    except ValueError:
        return None, "malformed"
    if value < 0:
        return None, "malformed"
    return value, "present"


def get_link_state(interface: str) -> dict:
    """Return normalized interface state for *interface*."""
    _, stdout, _ = _run(["ip", "-details", "link", "show", "dev", interface])

    carrier = False
    operstate = "unknown"
    speed_mbps = None

    if stdout:
        if "state UP" in stdout:
            operstate = "UP"
            carrier = True
        elif "state DOWN" in stdout:
            operstate = "DOWN"
        elif "state UNKNOWN" in stdout:
            operstate = "UNKNOWN"
            # UNKNOWN often means the interface is up but has no L2 state machine
            carrier = True

    # Prefer /sys/class/net for carrier and speed — more reliable than ip output
    sys_carrier = _read_sys(f"/sys/class/net/{interface}/carrier")
    if sys_carrier is not None:
        carrier = sys_carrier == "1"

    sys_operstate = _read_sys(f"/sys/class/net/{interface}/operstate")
    if sys_operstate:
        operstate = sys_operstate

    sys_speed = _read_sys(f"/sys/class/net/{interface}/speed")
    if sys_speed is not None:
        try:
            v = int(sys_speed)
            if v > 0:
                speed_mbps = v
        except ValueError:
            pass

    rx_errors, rx_errors_availability = _read_counter(f"/sys/class/net/{interface}/statistics/rx_errors")
    tx_errors, tx_errors_availability = _read_counter(f"/sys/class/net/{interface}/statistics/tx_errors")

    return {
        "name": interface,
        "carrier": carrier,
        "operstate": operstate,
        "speed_mbps": speed_mbps,
        "rx_errors": rx_errors,
        "tx_errors": tx_errors,
        "rx_errors_availability": rx_errors_availability,
        "tx_errors_availability": tx_errors_availability,
    }
