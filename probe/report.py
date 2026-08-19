"""Build a normalized probe report from all collectors."""

from __future__ import annotations

import platform
import socket
from datetime import datetime, timezone
from typing import Literal

from .classifier import classify
from .dns import probe_dns
from .interfaces import get_link_state
from .latency import DEFAULT_MIN_VALID_THROUGHPUT_MBPS, probe_loaded_latency
from .qdisc import get_qdisc_stats
from .routes import get_route_table

SCHEMA_VERSION = "0.1"


def build_report(
    wan_interface: str,
    gateway: str | None,
    dns_server: str | None,
    target: str,
    mode: Literal["idle", "upload-loaded", "download-loaded"] = "idle",
    iperf_server: str | None = None,
    duration: int = 30,
    idle_ping_count: int = 60,
    dns_hostname: str = "example.com",
    dns_samples: int = 5,
    idle_baseline_p95_ms: float | None = None,
    min_valid_throughput_mbps: float = DEFAULT_MIN_VALID_THROUGHPUT_MBPS,
) -> dict:
    """Collect all probe data and return a complete, normalized report.

    If *idle_baseline_p95_ms* is given for a loaded *mode*, the report's
    latency.delta_rtt_p95_ms is computed against that baseline in this same
    run. For a rigorous before/after comparison across two separate runs,
    use `gateway-probe-compare` instead.
    """

    iface = get_link_state(wan_interface)
    routing = get_route_table()

    # Prefer the discovered gateway over the CLI-supplied one when available
    effective_gateway = routing.get("gateway") or gateway

    latency = probe_loaded_latency(
        target=target,
        gateway=effective_gateway,
        mode=mode,
        iperf_server=iperf_server,
        duration=duration,
        ping_count=idle_ping_count if mode == "idle" else None,
        min_valid_throughput_mbps=min_valid_throughput_mbps,
    )

    latency["idle_baseline_p95_ms"] = idle_baseline_p95_ms

    if (
        mode != "idle"
        and idle_baseline_p95_ms is not None
        and latency.get("public_p95_ms") is not None
    ):
        latency["delta_rtt_p95_ms"] = round(latency["public_p95_ms"] - idle_baseline_p95_ms, 2)

    dns = probe_dns(
        hostname=dns_hostname,
        server=dns_server,
        samples=dns_samples,
    )

    qdisc = get_qdisc_stats(wan_interface)

    report: dict = {
        "schema_version": SCHEMA_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "host": {
            "hostname": socket.gethostname(),
            "platform": platform.platform(),
        },
        "interface": iface,
        "routing": routing,
        "latency": latency,
        "dns": dns,
        "qdisc": qdisc,
        "findings": [],
    }

    report["findings"] = classify(report)
    return report
