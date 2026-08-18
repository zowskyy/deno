"""CAKE / qdisc statistics collection."""

import re
import subprocess


def _run(command: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(command, capture_output=True, text=True, timeout=15)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


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

        # ECN marks appear in CAKE output as "marks N"
        m = re.search(r"\bmarks\s+(\d+)", stdout)
        if m:
            marks = int(m.group(1))

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
