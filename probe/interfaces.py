"""WAN interface state collection."""

import re
import subprocess
from pathlib import Path


def _run(command: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(command, capture_output=True, text=True, timeout=15)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _read_sys(path: str) -> str | None:
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


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

        m = re.search(r"link/ether", stdout)
        if not m:
            # Could be a VLAN or tunnel; still count as potentially up
            pass

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

    rx_errors = 0
    tx_errors = 0
    try:
        rx_errors = int(_read_sys(f"/sys/class/net/{interface}/statistics/rx_errors") or "0")
        tx_errors = int(_read_sys(f"/sys/class/net/{interface}/statistics/tx_errors") or "0")
    except ValueError:
        pass

    return {
        "name": interface,
        "carrier": carrier,
        "operstate": operstate,
        "speed_mbps": speed_mbps,
        "rx_errors": rx_errors,
        "tx_errors": tx_errors,
    }
