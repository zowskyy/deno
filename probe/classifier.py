"""Deterministic rule-based diagnostic classifier.

Evaluates a normalized probe report and returns a list of findings ordered
from highest to lowest confidence. Evidence-based language: findings describe
measured facts, not root-cause verdicts. No ML; every rule is inspectable and
testable in isolation.
"""

from __future__ import annotations

LATENCY_INCREASE_THRESHOLD_MS = 50


def classify(report: dict) -> list[dict]:
    """Return a list of findings for *report*, ordered by confidence."""
    findings: list[dict] = []

    iface = report.get("interface", {})
    routing = report.get("routing", {})
    latency = report.get("latency", {})
    dns = report.get("dns", {})
    qdisc = report.get("qdisc", {})

    # --- Physical link unavailable ---
    if not iface.get("carrier", True):
        findings.append({
            "category": "physical_link_unavailable",
            "confidence": 0.99,
            "evidence": {
                "interface": iface.get("name", "?"),
                "carrier": iface.get("carrier", False),
            },
            "interpretation": f"WAN interface '{iface.get('name', '?')}' reports no carrier.",
        })

    # --- Default route missing ---
    if not routing.get("default_route_present", True):
        findings.append({
            "category": "default_route_missing",
            "confidence": 0.98,
            "evidence": {
                "default_route_present": routing.get("default_route_present", False),
            },
            "interpretation": "No default route is installed. DHCP may have failed or the lease expired.",
        })

    # --- Next hop probe failed ---
    gw_p95 = latency.get("gateway_p95_ms")
    gw_target = latency.get("gateway_target")
    if gw_p95 is None and gw_target:
        findings.append({
            "category": "next_hop_probe_failed",
            "confidence": 0.90,
            "evidence": {
                "gateway_target": gw_target,
                "gateway_p95_ms": gw_p95,
            },
            "interpretation": f"The gateway at {gw_target} did not respond to pings.",
        })

    # --- DNS transport or resolver failed ---
    if not dns.get("success", True):
        findings.append({
            "category": "dns_resolution_failed",
            "confidence": 0.85,
            "evidence": {
                "hostname": dns.get("hostname", "?"),
                "server": dns.get("server") or "system resolver",
                "error": dns.get("error", "unknown error"),
            },
            "interpretation": (
                f"DNS lookup for '{dns.get('hostname', '?')}' via "
                f"{dns.get('server') or 'system resolver'} did not succeed."
            ),
        })

    # --- Public path probe failed (but local ok) ---
    if not latency.get("success", True) and gw_p95 is not None:
        findings.append({
            "category": "public_path_probe_failed",
            "confidence": 0.75,
            "evidence": {
                "target": latency.get("target", "?"),
                "gateway_reachable": True,
                "public_reachable": False,
            },
            "interpretation": (
                f"Public target {latency.get('target', '?')} is unreachable but "
                "the local gateway responded. This indicates an ISP or upstream path issue."
            ),
        })

    # --- Full connectivity loss ---
    elif not latency.get("success", True) and gw_p95 is None:
        findings.append({
            "category": "full_connectivity_loss",
            "confidence": 0.80,
            "evidence": {
                "gateway_reachable": False,
                "public_reachable": False,
            },
            "interpretation": (
                "Both the gateway and public target are unreachable. "
                "Check physical link, DHCP, and gateway configuration."
            ),
        })

    # --- Latency increased under confirmed load ---
    cake = qdisc.get("cake_detected", False)
    delta = latency.get("delta_rtt_p95_ms")
    mode = latency.get("mode", "")
    load_valid = latency.get("load_validation", {}).get("valid_for_wan_comparison", False)

    if delta is not None and delta > LATENCY_INCREASE_THRESHOLD_MS and load_valid:
        if cake:
            findings.append({
                "category": "latency_increased_while_cake_traffic_observed",
                "confidence": 0.70,
                "evidence": {
                    "idle_rtt_p95_ms": latency.get("public_p95_ms"),
                    "loaded_rtt_p95_ms": latency.get("public_p95_ms"),
                    "delta_ms": delta,
                    "cake_detected": cake,
                },
                "interpretation": (
                    f"Public-target latency increased by {delta:.0f} ms during a confirmed load test, "
                    "despite a detected CAKE qdisc. This may indicate the bandwidth limit is set too aggressively."
                ),
            })
        else:
            findings.append({
                "category": "latency_increased_with_cake_not_detected",
                "confidence": 0.88,
                "evidence": {
                    "idle_rtt_p95_ms": latency.get("public_p95_ms"),
                    "loaded_rtt_p95_ms": latency.get("public_p95_ms"),
                    "delta_ms": delta,
                    "cake_detected": cake,
                },
                "interpretation": (
                    f"Public-target latency increased by {delta:.0f} ms during a confirmed load test "
                    "and CAKE is not detected. Enabling CAKE on the WAN egress qdisc may reduce queueing."
                ),
            })

    # --- High packet loss ---
    loss = latency.get("loss_percent")
    if loss is not None and loss > 5.0:
        findings.append({
            "category": "packet_loss_observed",
            "confidence": 0.82,
            "evidence": {
                "loss_percent": loss,
                "threshold_percent": 5.0,
            },
            "interpretation": f"Packet loss is {loss:.1f}%, exceeding the 5% threshold.",
        })

    # --- CAKE queue management events ---
    if cake:
        drops = qdisc.get("drops") or 0
        marks = qdisc.get("marks") or 0

        if drops > 100 or marks > 100:
            findings.append({
                "category": "cake_aqm_events_observed",
                "confidence": 0.65,
                "evidence": {
                    "cake_detected": cake,
                    "drops": drops,
                    "marks": marks,
                    "backlog_bytes": qdisc.get("backlog_bytes"),
                },
                "interpretation": (
                    f"CAKE qdisc issued {drops} drops and {marks} ECN marks during this probe window. "
                    "This indicates active queue management."
                ),
            })

    findings.sort(key=lambda f: f["confidence"], reverse=True)
    return findings
