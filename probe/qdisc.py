"""CAKE / qdisc statistics collection."""

import re

from .shell import run_command as _run


def get_qdisc_stats(interface: str) -> dict:
    """Return CAKE statistics for *interface*, or a generic qdisc summary."""
    _, stdout, _ = _run(["tc", "-s", "qdisc", "show", "dev", interface])

    cake_detected = bool(re.search(r"\bcake\b", stdout, re.IGNORECASE))
    drops: int | None = None
    marks: int | None = None
    backlog_bytes: int | None = None

    if stdout:
        # "Sent X bytes Y pkts (dropped Z, overlimits …)"
        m = re.search(r"dropped\s+(\d+)", stdout)
        if m:
            drops = int(m.group(1))

        # ECN marks appear as one "marks" line with one value per tin, e.g.
        # "  marks                20           0           5" in
        # diffserv3/diffserv4 mode (a common OpenWrt SQM preset). A plain
        # `marks\s+(\d+)` capture only grabs the first tin's value, so a
        # busy tin other than the first would be silently missed — sum all
        # the values on the line instead.
        m = re.search(r"^\s*marks((?:\s+\d+)+)\s*$", stdout, re.MULTILINE)
        if m:
            marks = sum(int(x) for x in m.group(1).split())

        # "backlog Xb Ypkts"
        m = re.search(r"backlog\s+(\d+)b", stdout)
        if m:
            backlog_bytes = int(m.group(1))

    return {
        "interface": interface,
        "cake_detected": cake_detected,
        "drops": drops,
        "marks": marks,
        "backlog_bytes": backlog_bytes,
        "raw": stdout if stdout else None,
    }
