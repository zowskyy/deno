"""Tests for the deterministic diagnostic classifier."""

import json
from pathlib import Path

import pytest

from probe.classifier import classify

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _base_report() -> dict:
    return json.loads((FIXTURE_DIR / "sample_report.json").read_text())


# --------------------------------------------------------------------------- #
# Helper                                                                       #
# --------------------------------------------------------------------------- #

def _categories(report: dict) -> set[str]:
    return {f["category"] for f in classify(report)}


# --------------------------------------------------------------------------- #
# Happy path                                                                   #
# --------------------------------------------------------------------------- #

class TestNoFindings:
    def test_healthy_report_produces_no_findings(self):
        report = _base_report()
        findings = classify(report)
        assert findings == []


# --------------------------------------------------------------------------- #
# Injected failure: physical link down                                         #
# --------------------------------------------------------------------------- #

class TestLinkFailure:
    def test_no_carrier_raises_physical_link_finding(self):
        report = _base_report()
        report["interface"]["carrier"] = False
        cats = _categories(report)
        assert "physical_link" in cats

    def test_physical_link_has_highest_confidence(self):
        report = _base_report()
        report["interface"]["carrier"] = False
        findings = classify(report)
        top = findings[0]
        assert top["category"] == "physical_link"
        assert top["confidence"] >= 0.99


# --------------------------------------------------------------------------- #
# Injected failure: missing default route                                      #
# --------------------------------------------------------------------------- #

class TestMissingRoute:
    def test_no_default_route_raises_address_configuration_finding(self):
        report = _base_report()
        report["routing"]["default_route_present"] = False
        report["routing"]["gateway"] = None
        cats = _categories(report)
        assert "address_configuration" in cats


# --------------------------------------------------------------------------- #
# Injected failure: DNS failure                                                #
# --------------------------------------------------------------------------- #

class TestDnsFailure:
    def test_dns_failure_raises_dns_finding(self):
        report = _base_report()
        report["dns"]["success"] = False
        report["dns"]["error"] = "SERVFAIL"
        cats = _categories(report)
        assert "dns" in cats

    def test_dns_finding_mentions_hostname(self):
        report = _base_report()
        report["dns"]["success"] = False
        report["dns"]["error"] = "timeout"
        findings = classify(report)
        dns_findings = [f for f in findings if f["category"] == "dns"]
        assert dns_findings
        assert "example.com" in dns_findings[0]["reason"]


# --------------------------------------------------------------------------- #
# Injected failure: WAN unreachable, gateway still up                          #
# --------------------------------------------------------------------------- #

class TestWanFailure:
    def test_wan_failure_with_gateway_up_raises_wan_finding(self):
        report = _base_report()
        report["latency"]["success"] = False
        report["latency"]["gateway_p95_ms"] = 2.1  # gateway still responds
        cats = _categories(report)
        assert "wan_or_upstream" in cats

    def test_wan_failure_without_gateway_raises_full_connectivity_finding(self):
        report = _base_report()
        report["latency"]["success"] = False
        report["latency"]["gateway_p95_ms"] = None
        cats = _categories(report)
        assert "full_connectivity_loss" in cats


# --------------------------------------------------------------------------- #
# Bufferbloat detection                                                        #
# --------------------------------------------------------------------------- #

class TestBufferbloat:
    def test_large_delta_rtt_without_cake_raises_bufferbloat_no_cake(self):
        report = _base_report()
        report["latency"]["delta_rtt_p95_ms"] = 150.0
        report["qdisc"]["cake_detected"] = False
        cats = _categories(report)
        assert "bufferbloat_no_cake" in cats

    def test_large_delta_rtt_with_cake_raises_bufferbloat_with_cake(self):
        report = _base_report()
        report["latency"]["delta_rtt_p95_ms"] = 80.0
        report["qdisc"]["cake_detected"] = True
        cats = _categories(report)
        assert "bufferbloat_with_cake" in cats

    def test_small_delta_rtt_produces_no_bufferbloat_finding(self):
        report = _base_report()
        report["latency"]["delta_rtt_p95_ms"] = 10.0
        cats = _categories(report)
        assert "bufferbloat_no_cake" not in cats
        assert "bufferbloat_with_cake" not in cats


# --------------------------------------------------------------------------- #
# Multiple simultaneous failures                                               #
# --------------------------------------------------------------------------- #

class TestMultipleFailures:
    def test_link_down_and_dns_failure_both_reported(self):
        report = _base_report()
        report["interface"]["carrier"] = False
        report["dns"]["success"] = False
        report["dns"]["error"] = "timeout"
        cats = _categories(report)
        assert "physical_link" in cats
        assert "dns" in cats

    def test_findings_sorted_by_descending_confidence(self):
        report = _base_report()
        report["interface"]["carrier"] = False
        report["routing"]["default_route_present"] = False
        report["routing"]["gateway"] = None
        findings = classify(report)
        confidences = [f["confidence"] for f in findings]
        assert confidences == sorted(confidences, reverse=True)


# --------------------------------------------------------------------------- #
# Packet loss                                                                  #
# --------------------------------------------------------------------------- #

class TestPacketLoss:
    def test_high_loss_raises_packet_loss_finding(self):
        report = _base_report()
        report["latency"]["loss_percent"] = 15.0
        cats = _categories(report)
        assert "packet_loss" in cats

    def test_low_loss_does_not_raise_finding(self):
        report = _base_report()
        report["latency"]["loss_percent"] = 2.0
        cats = _categories(report)
        assert "packet_loss" not in cats
