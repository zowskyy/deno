"""Routing table inspection."""

import re
import subprocess


def _run(command: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(command, capture_output=True, text=True, timeout=15)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def get_default_gateway() -> str | None:
    """Return the IPv4 default gateway address, or None if not present."""
    _, stdout, _ = _run(["ip", "route", "show", "default"])
    m = re.search(r"default via (\S+)", stdout)
    return m.group(1) if m else None


def get_route_table() -> dict:
    """Return the full IPv4 route table in normalized form."""
    _, stdout, _ = _run(["ip", "-details", "route", "show"])
    routes = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        entry: dict = {"raw": line}
        m = re.search(r"via (\S+)", line)
        if m:
            entry["gateway"] = m.group(1)
        m = re.search(r"dev (\S+)", line)
        if m:
            entry["dev"] = m.group(1)
        m = re.search(r"src (\S+)", line)
        if m:
            entry["src"] = m.group(1)
        prefix = line.split()[0]
        entry["prefix"] = prefix
        routes.append(entry)

    gateway = get_default_gateway()
    return {
        "default_route_present": gateway is not None,
        "gateway": gateway,
        "routes": routes,
    }
