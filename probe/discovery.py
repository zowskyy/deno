"""Auto-discover the WAN interface from the default route."""

import re
import subprocess


def discover_wan_interface() -> str | None:
    """Return the interface name used by the default IPv4 route, or None."""
    try:
        result = subprocess.run(
            ["ip", "route", "show", "default"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        stdout = result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None

    m = re.search(r"dev\s+(\S+)", stdout)
    return m.group(1) if m else None
