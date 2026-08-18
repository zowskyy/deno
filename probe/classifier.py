"""Deterministic rule-based diagnostic classifier.

Evaluates a normalized probe report and returns a list of findings ordered
from highest to lowest confidence.  No ML; every rule is inspectable and
testable in isolation.
"""

from __future__ import annotations

BUFFERBLOAT_THRESHOLD_MS = 50  # delta RTT that warrants a bufferbloat finding


def classify(report: dict) -> list[dict]:
    """Return a list of findings for *report*."""
    findings: list[dict] = []

    iface = report.get("interface", {})
    routing = report.get("routing", {})
    latency = report.get("latency", {})
    dns = report.get("dns", {})
    qdisc = report.get("qdisc", {})

    # --- Physical link ---
    if not iface.get("carrier", True):
        findings.append({
            "category": "physical_link",
            "confidence": 0.99,
            "reason": (
                f"WAN interface '{iface.get('name', '?')}' has no carrier. "
                "Check the physical cable and the upstream port."
            ),
        })

    # --- Default route ---
    if not routing.get("default_route_present", True):
        findings.append({
            "category": "address_configuration",
            "confidence": 0.98,
            "reason": (
                "No default route is installed. "
                "The DHCP lease may have expired or was never obtained."
            ),
        })

    # --- Gateway reachability ---
    gw_p95 = latency.get("gateway_p95_ms")
    if gw_p95 is None and latency.get("gateway_target"):
        findings.append({
            "category": "gateway_or_local_network",
            "confidence": 0.90,
            "reason": (
                f"Gateway {latency.get('gateway_target')} did not respond to pings. "
                "Possible CPE issue or misconfigured gateway address."
            ),
        })

    # --- DNS ---
    if not dns.get("success", True):
        findings.append({
            "category": "dns",
            "confidence": 0.85,
            "reason": (
                f"DNS lookup for '{dns.get('hostname', '?')}' via "
                f"{dns.get('server') or 'system resolver'} failed: "
                f"{dns.get('error') or 'unknown error'}."
            ),
        })

    # --- WAN / public connectivity ---
    if not latency.get("success", True) and latency.get("gateway_p95_ms") is not None:
        findings.append({
            "category": "wan_or_upstream",
            "confidence": 0.75,
            "reason": (
                f"Public target {latency.get('target', '?')} is unreachable "
                "but the local gateway responded. "
                "Likely an ISP or upstream path issue."
            ),
        })
    elif not latency.get("success", True) and latency.get("gateway_p95_ms") is None:
        findings.append({
            "category": "full_connectivity_loss",
            "confidence": 0.80,
            "reason": (
                "Both the gateway and public target are unreachable. "
                "Check physical link, DHCP, and gateway configuration."
            ),
        })

    # --- CAKE / bufferbloat ---
    cake = qdisc.get("cake_detected", False)
    delta = latency.get("delta_rtt_p95_ms")

    if delta is not None and delta > BUFFERBLOAT_THRESHOLD_MS:
        if cake:
            findings.append({
                "category": "bufferbloat_with_cake",
                "confidence": 0.70,
                "reason": (
                    f"CAKE is active but loaded RTT p95 is still {delta:.0f} ms above idle RTT. "
                    "Consider lowering the CAKE bandwidth limit closer to the actual line rate."
                ),
            })
        else:
            findings.append({
                "category": "bufferbloat_no_cake",
                "confidence": 0.88,
                "reason": (
                    f"Loaded RTT p95 is {delta:.0f} ms above idle RTT and CAKE is not detected. "
                    "Enabling CAKE on the WAN egress qdisc is strongly recommended."
                ),
            })

    # --- High packet loss ---
    loss = latency.get("loss_percent")
    if loss is not None and loss > 5:
        findings.append({
            "category": "packet_loss",
            "confidence": 0.82,
            "reason": f"Packet loss is {loss:.1f}%, which exceeds the 5% threshold.",
        })

    # CAKE drop / mark counters
    if cake:
        drops = qdisc.get("drops") or 0
        marks = qdisc.get("marks") or 0
        if drops > 100:
            findings.append({
                "category": "cake_drops",
                "confidence": 0.65,
                "reason": (
                    f"CAKE has dropped {drops} packets during this probe window. "
                    "The bandwidth limit may be set too low."
                ),
            })
        if marks > 100:
            findings.append({
                "category": "cake_ecn_marks",
                "confidence": 0.55,
                "reason": (
                    f"CAKE has issued {marks} ECN marks. "
                    "ECN is working; consider whether marks are excessive."
                ),
            })

    findings.sort(key=lambda f: f["confidence"], reverse=True)
    return findings
