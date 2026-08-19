"""Validates real report output against the published JSON schemas.

These were previously undefined behavior: the schemas existed as
documentation but nothing ever actually checked that report.py's or
devices_report.py's real output conforms to them. A field rename or
removal in either module could have silently drifted from the documented
contract without any test catching it.
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

from probe.classifier import classify
from probe.device_history import diff_and_save, open_device_store
from probe.devices_report import build_device_report

SCHEMA_DIR = Path(__file__).parent.parent / "schemas"
FIXTURE_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def probe_report_schema():
    return json.loads((SCHEMA_DIR / "probe-report.schema.json").read_text())


@pytest.fixture
def device_report_schema():
    return json.loads((SCHEMA_DIR / "device-report.schema.json").read_text())


class TestProbeReportSchema:
    def test_fixture_sample_report_is_valid(self, probe_report_schema):
        report = json.loads((FIXTURE_DIR / "sample_report.json").read_text())
        jsonschema.validate(report, probe_report_schema)

    def test_fixture_with_findings_is_valid(self, probe_report_schema):
        # Exercise the findings array shape (evidence/interpretation, not
        # the old reason field) with a real classifier run, not a
        # hand-crafted findings list that could drift from what the
        # classifier actually produces.
        report = json.loads((FIXTURE_DIR / "sample_report.json").read_text())
        report["interface"]["carrier"] = False
        report["routing"]["default_route_present"] = False
        report["findings"] = classify(report)
        assert len(report["findings"]) > 0  # sanity: this really exercised the classifier
        jsonschema.validate(report, probe_report_schema)

    def test_bufferbloat_finding_shape_is_valid(self, probe_report_schema):
        report = json.loads((FIXTURE_DIR / "sample_report.json").read_text())
        report["latency"]["delta_rtt_p95_ms"] = 150.0
        report["latency"]["load_validation"]["valid_for_wan_comparison"] = True
        report["qdisc"]["cake_detected"] = False
        report["findings"] = classify(report)
        assert len(report["findings"]) > 0
        jsonschema.validate(report, probe_report_schema)


class TestDeviceReportSchema:
    def test_report_without_store_is_valid(self, monkeypatch, device_report_schema):
        from probe import devices_report as report_mod

        monkeypatch.setattr(
            report_mod,
            "build_device_inventory",
            lambda: {
                "source": "ip neigh",
                "device_count": 1,
                "counts": {"known_vendor": 1, "randomized_private": 0, "unknown_vendor": 0},
                "devices": [
                    {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}
                ],
            },
        )
        report = build_device_report(db_path=None)
        jsonschema.validate(report, device_report_schema)

    def test_first_scan_with_store_is_valid(self, tmp_path, monkeypatch, device_report_schema):
        from probe import devices_report as report_mod

        monkeypatch.setattr(
            report_mod,
            "build_device_inventory",
            lambda: {
                "source": "ip neigh",
                "device_count": 1,
                "counts": {"known_vendor": 0, "randomized_private": 1, "unknown_vendor": 0},
                "devices": [
                    {"ip": "192.168.1.5", "mac": "02:00:00:00:00:01", "vendor": None, "type": "randomized_private"}
                ],
            },
        )
        report = build_device_report(db_path=str(tmp_path / "devices.db"))
        jsonschema.validate(report, device_report_schema)

    def test_report_with_new_and_missing_events_is_valid(self, tmp_path, device_report_schema):
        # Build the report dict the same way devices_report.build_device_report
        # does internally, but drive diff_and_save directly across two real
        # scans so events_this_scan/missing_devices are genuinely populated
        # (the sandbox's static ARP table can't produce a real transition on
        # its own).
        db_path = tmp_path / "devices.db"
        conn = open_device_store(db_path)
        diff_and_save(
            conn,
            [
                {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"},
                {"ip": "192.168.1.6", "mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"},
            ],
            "2026-01-01T00:00:00Z",
        )
        diff2 = diff_and_save(
            conn,
            [
                {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"},
                {"ip": "192.168.1.7", "mac": "02:00:00:00:00:99", "vendor": None, "type": "randomized_private"},
            ],
            "2026-01-02T00:00:00Z",
        )
        conn.close()

        report = {
            "schema_version": "0.1",
            "timestamp": "2026-01-02T00:00:00Z",
            "source": "ip neigh",
            "device_count": 2,
            "counts": {"known_vendor": 1, "randomized_private": 1, "unknown_vendor": 0},
            "devices": [
                {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"},
                {"ip": "192.168.1.7", "mac": "02:00:00:00:00:99", "vendor": None, "type": "randomized_private"},
            ],
            "new_device_count": len(diff2["new_devices"]),
            "new_devices": diff2["new_devices"],
            "missing_device_count": len(diff2["missing_devices"]),
            "missing_devices": diff2["missing_devices"],
            "is_first_scan": diff2["is_first_scan"],
            "events_this_scan": diff2["events"],
            "summary": "test",
        }
        assert len(report["events_this_scan"]) == 2  # sanity: real transitions happened
        jsonschema.validate(report, device_report_schema)

    def test_missing_devices_are_plain_strings_not_objects(self, tmp_path, device_report_schema):
        # Regression guard for a specific schema nuance: missing_devices is
        # a list of MAC strings (from device_history's missing_macs), not
        # a list of device objects like `devices`/`new_devices` — the
        # schema must accept that, and this locks the real shape in.
        db_path = tmp_path / "devices.db"
        conn = open_device_store(db_path)
        diff_and_save(
            conn,
            [{"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}],
            "2026-01-01T00:00:00Z",
        )
        diff2 = diff_and_save(conn, [], "2026-01-02T00:00:00Z")  # device goes missing
        conn.close()

        assert diff2["missing_devices"] == ["3C:5A:B4:12:34:56"]
        assert isinstance(diff2["missing_devices"][0], str)

        report = {
            "schema_version": "0.1",
            "timestamp": "2026-01-02T00:00:00Z",
            "source": "ip neigh",
            "device_count": 0,
            "counts": {"known_vendor": 0, "randomized_private": 0, "unknown_vendor": 0},
            "devices": [],
            "new_device_count": 0,
            "new_devices": [],
            "missing_device_count": 1,
            "missing_devices": diff2["missing_devices"],
            "is_first_scan": False,
            "events_this_scan": diff2["events"],
            "summary": "test",
        }
        jsonschema.validate(report, device_report_schema)
