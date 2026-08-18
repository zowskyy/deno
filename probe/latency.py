"""Latency probes: idle and load-tested RTT measurements."""

from __future__ import annotations

import re
import shutil
import subprocess
import threading
from typing import Literal


def _run(command: list[str], timeout: int = 120) -> tuple[int, str, str]:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _parse_ping_output(stdout: str) -> dict:
    """Extract p50/p95 and loss from ping -c N output."""
    rtts: list[float] = []
    loss_percent: float | None = None

    # Parse per-line RTT values: "64 bytes from … time=X.Y ms"
    for m in re.finditer(r"time[<=](\d+\.?\d*)\s*ms", stdout):
        rtts.append(float(m.group(1)))

    # "X% packet loss"
    m = re.search(r"(\d+(?:\.\d+)?)%\s+packet loss", stdout)
    if m:
        loss_percent = float(m.group(1))

    # Fallback: "rtt min/avg/max/mdev = A/B/C/D ms"
    avg_ms: float | None = None
    m = re.search(r"rtt\s+\S+\s*=\s*[\d.]+/([\d.]+)/[\d.]+/[\d.]+\s*ms", stdout)
    if m:
        avg_ms = float(m.group(1))

    if not rtts and avg_ms:
        rtts = [avg_ms]

    if not rtts:
        return {"success": False, "p50_ms": None, "p95_ms": None, "loss_percent": loss_percent, "samples": 0}

    rtts.sort()
    p50_idx = max(0, len(rtts) // 2)
    p95_idx = max(0, int(len(rtts) * 0.95) - 1)
    return {
        "success": True,
        "p50_ms": round(rtts[p50_idx], 2),
        "p95_ms": round(rtts[p95_idx], 2),
        "loss_percent": loss_percent if loss_percent is not None else 0.0,
        "samples": len(rtts),
    }


def probe_ping(target: str, count: int = 20, deadline: int = 30) -> dict:
    """Ping *target* *count* times and return RTT statistics."""
    command = ["ping", "-c", str(count), "-W", "2", "-i", "0.2", target]
    try:
        rc, stdout, stderr = _run(command, timeout=deadline + 5)
    except subprocess.TimeoutExpired:
        return {
            "target": target,
            "success": False,
            "p50_ms": None,
            "p95_ms": None,
            "loss_percent": 100.0,
            "samples": 0,
            "error": "timeout",
        }

    result = _parse_ping_output(stdout)
    result["target"] = target
    return result


def _iperf3_throughput(server: str, duration: int, reverse: bool) -> float | None:
    """Run iperf3 and return throughput in Mbps, or None on failure."""
    if not shutil.which("iperf3"):
        return None
    command = ["iperf3", "-c", server, "-t", str(duration), "-J"]
    if reverse:
        command.append("-R")
    try:
        rc, stdout, _ = _run(command, timeout=duration + 30)
        if rc != 0:
            return None
        import json
        data = json.loads(stdout)
        bps = data["end"]["sum_received"]["bits_per_second"]
        return round(bps / 1_000_000, 2)
    except Exception:
        return None


def probe_loaded_latency(
    target: str,
    gateway: str | None,
    mode: Literal["idle", "upload-loaded", "download-loaded"],
    iperf_server: str | None = None,
    duration: int = 30,
    ping_count: int | None = None,
) -> dict:
    """
    Probe latency under the given *mode*.

    For 'idle', just pings the public target.
    For 'upload-loaded' / 'download-loaded', runs concurrent iperf3 + ping.
    Returns a dict suitable for the 'latency' section of the probe report.
    """
    if ping_count is None:
        ping_count = duration * 4  # ~4 pings/s

    result: dict = {
        "mode": mode,
        "target": target,
        "gateway_target": gateway,
        "success": False,
        "gateway_p50_ms": None,
        "gateway_p95_ms": None,
        "public_p50_ms": None,
        "public_p95_ms": None,
        "loss_percent": None,
        "samples": 0,
        "loaded_throughput_mbps": None,
        "delta_rtt_p95_ms": None,
    }

    # Gateway ping (always)
    if gateway:
        gw = probe_ping(gateway, count=20, deadline=30)
        result["gateway_p50_ms"] = gw.get("p50_ms")
        result["gateway_p95_ms"] = gw.get("p95_ms")

    if mode == "idle":
        pub = probe_ping(target, count=ping_count, deadline=duration + 15)
        result.update(
            success=pub["success"],
            public_p50_ms=pub.get("p50_ms"),
            public_p95_ms=pub.get("p95_ms"),
            loss_percent=pub.get("loss_percent"),
            samples=pub.get("samples", 0),
        )
        return result

    # Loaded modes need iperf3
    if not iperf_server:
        result["success"] = False
        result["error"] = "iperf_server is required for loaded latency tests"
        return result

    throughput_holder: list[float | None] = [None]
    reverse = mode == "download-loaded"

    def run_iperf() -> None:
        throughput_holder[0] = _iperf3_throughput(iperf_server, duration, reverse)

    iperf_thread = threading.Thread(target=run_iperf, daemon=True)
    iperf_thread.start()

    pub = probe_ping(target, count=ping_count, deadline=duration + 15)

    iperf_thread.join(timeout=duration + 30)

    result.update(
        success=pub["success"],
        public_p50_ms=pub.get("p50_ms"),
        public_p95_ms=pub.get("p95_ms"),
        loss_percent=pub.get("loss_percent"),
        samples=pub.get("samples", 0),
        loaded_throughput_mbps=throughput_holder[0],
    )
    return result
