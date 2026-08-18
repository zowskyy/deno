"""DNS resolution probes."""

import re
import shutil
import socket
import time

from .shell import run_command as _run


def _parse_dig_time(stdout: str) -> float | None:
    """Extract query time in ms from dig output."""
    m = re.search(r"Query time:\s+(\d+)\s+msec", stdout)
    if m:
        return float(m.group(1))
    return None


def probe_dns(hostname: str = "example.com", server: str | None = None, samples: int = 5) -> dict:
    """Run *samples* DNS lookups and return timing statistics."""
    if not shutil.which("dig"):
        # Fallback: single socket lookup, no timing breakdown
        try:
            t0 = time.perf_counter()
            socket.getaddrinfo(hostname, None)
            elapsed_ms = (time.perf_counter() - t0) * 1000
            return {
                "server": server,
                "hostname": hostname,
                "success": True,
                "query_ms": round(elapsed_ms, 2),
                "p95_ms": round(elapsed_ms, 2),
                "error": None,
            }
        except OSError as exc:
            return {
                "server": server,
                "hostname": hostname,
                "success": False,
                "query_ms": None,
                "p95_ms": None,
                "error": str(exc),
            }

    times: list[float] = []
    errors: list[str] = []

    for _ in range(samples):
        command = ["dig", "+time=3", "+tries=1", "+stats", hostname]
        if server:
            command += ["@" + server]
        rc, stdout, stderr = _run(command)
        if rc == 0:
            t = _parse_dig_time(stdout)
            if t is not None:
                times.append(t)
        else:
            errors.append(stderr or stdout)

    if not times:
        return {
            "server": server,
            "hostname": hostname,
            "success": False,
            "query_ms": None,
            "p95_ms": None,
            "error": "; ".join(errors) if errors else "all queries failed",
        }

    times.sort()
    p95_idx = max(0, int(len(times) * 0.95) - 1)
    return {
        "server": server,
        "hostname": hostname,
        "success": True,
        "query_ms": round(times[len(times) // 2], 2),
        "p95_ms": round(times[p95_idx], 2),
        "error": None,
    }
