"""Tests for the plain-language device report — this is the actual
user-facing output, so the wording logic (singular/plural, first-scan vs
repeat, unavailable source) is tested directly, not just the data plumbing.
"""

from __future__ import annotations

from probe import devices_report as report_mod
from probe.devices_report import _plain_summary, build_device_report, get_recent_activity


def _inventory(devices, source="ip neigh"):
    counts = {"known_vendor": 0, "randomized_private": 0, "unknown_vendor": 0}
    for d in devices:
        counts[d["type"]] += 1
    return {"source": source, "device_count": len(devices), "devices": devices, "counts": counts}


class TestPlainSummaryWording:
    def test_unavailable_source_explains_why(self):
        summary = _plain_summary(_inventory([], source="unavailable"), None)
        assert "couldn't check" in summary.lower()

    def test_zero_devices_is_a_clear_sentence(self):
        summary = _plain_summary(_inventory([]), None)
        assert summary == "No devices found on your network right now."

    def test_single_device_uses_singular(self):
        devices = [{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        summary = _plain_summary(_inventory(devices), None)
        assert "1 device connected" in summary
        assert "1 devices" not in summary

    def test_multiple_devices_uses_plural(self):
        devices = [
            {"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"},
            {"mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"},
        ]
        summary = _plain_summary(_inventory(devices), None)
        assert "2 devices connected" in summary

    def test_vendor_breakdown_is_named(self):
        devices = [{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        summary = _plain_summary(_inventory(devices), None)
        assert "Apple" in summary

    def test_first_scan_says_so_instead_of_alarming_new_count(self):
        devices = [{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        diff = {"is_first_scan": True, "new_devices": [], "known_devices": devices}
        summary = _plain_summary(_inventory(devices), diff)
        assert "first scan" in summary.lower()
        assert "new" not in summary.lower().split("first scan")[0]  # no false "N new" before that

    def test_new_devices_are_called_out_with_count(self):
        devices = [{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        new = [{"mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"}]
        diff = {"is_first_scan": False, "new_devices": new, "known_devices": devices, "missing_devices": []}
        summary = _plain_summary(_inventory(devices + new), diff)
        assert "1 device new since last scan" in summary

    def test_no_new_devices_says_so_plainly(self):
        devices = [{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        diff = {"is_first_scan": False, "new_devices": [], "known_devices": devices, "missing_devices": []}
        summary = _plain_summary(_inventory(devices), diff)
        assert "nothing new" in summary.lower()

    def test_missing_devices_are_called_out_with_count(self):
        devices = [{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        diff = {
            "is_first_scan": False,
            "new_devices": [],
            "known_devices": devices,
            "missing_devices": ["11:22:33:44:55:66"],
        }
        summary = _plain_summary(_inventory(devices), diff)
        assert "1 device hasn't been seen since last scan" in summary
        assert "nothing new" not in summary.lower()

    def test_multiple_missing_devices_uses_plural_verb(self):
        devices = [{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        diff = {
            "is_first_scan": False,
            "new_devices": [],
            "known_devices": devices,
            "missing_devices": ["11:22:33:44:55:66", "AA:BB:CC:DD:EE:FF"],
        }
        summary = _plain_summary(_inventory(devices), diff)
        assert "2 devices haven't been seen since last scan" in summary

    def test_new_and_missing_both_mentioned_together(self):
        devices = [{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        new = [{"mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"}]
        diff = {
            "is_first_scan": False,
            "new_devices": new,
            "known_devices": devices,
            "missing_devices": ["AA:BB:CC:DD:EE:FF"],
        }
        summary = _plain_summary(_inventory(devices + new), diff)
        assert "1 device new since last scan" in summary
        assert "1 device hasn't been seen since last scan" in summary


class TestBuildDeviceReport:
    def test_without_store_skips_diff_fields_gracefully(self, monkeypatch):
        monkeypatch.setattr(
            report_mod,
            "build_device_inventory",
            lambda: _inventory([{"mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]),
        )
        report = build_device_report(db_path=None)
        assert report["new_device_count"] is None
        assert report["is_first_scan"] is None
        assert report["device_count"] == 1
        assert "summary" in report and report["summary"]

    def test_with_store_integrates_baseline_diff(self, tmp_path, monkeypatch):
        db_path = str(tmp_path / "devices.db")
        devices = [{"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        monkeypatch.setattr(report_mod, "build_device_inventory", lambda: _inventory(devices))

        first = build_device_report(db_path=db_path)
        assert first["is_first_scan"] is True

        second_devices = devices + [
            {"ip": "192.168.1.6", "mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"}
        ]
        monkeypatch.setattr(report_mod, "build_device_inventory", lambda: _inventory(second_devices))

        second = build_device_report(db_path=db_path)
        assert second["is_first_scan"] is False
        assert second["new_device_count"] == 1

    def test_schema_version_present(self, monkeypatch):
        monkeypatch.setattr(report_mod, "build_device_inventory", lambda: _inventory([]))
        report = build_device_report(db_path=None)
        assert report["schema_version"] == "0.1"

    def test_missing_devices_are_surfaced_in_report(self, tmp_path, monkeypatch):
        db_path = str(tmp_path / "devices.db")
        devices = [
            {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"},
            {"ip": "192.168.1.6", "mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"},
        ]
        monkeypatch.setattr(report_mod, "build_device_inventory", lambda: _inventory(devices))
        build_device_report(db_path=db_path)  # first scan, baseline

        monkeypatch.setattr(report_mod, "build_device_inventory", lambda: _inventory(devices[:1]))
        second = build_device_report(db_path=db_path)
        assert second["missing_device_count"] == 1
        assert second["missing_devices"] == ["11:22:33:44:55:66"]


class TestGetRecentActivity:
    def test_returns_events_recorded_across_scans(self, tmp_path, monkeypatch):
        db_path = str(tmp_path / "devices.db")
        devices = [{"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}]
        monkeypatch.setattr(report_mod, "build_device_inventory", lambda: _inventory(devices))
        build_device_report(db_path=db_path)  # first scan: no events

        new_devices = devices + [
            {"ip": "192.168.1.6", "mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"}
        ]
        monkeypatch.setattr(report_mod, "build_device_inventory", lambda: _inventory(new_devices))
        build_device_report(db_path=db_path)  # second scan: device_new event

        activity = get_recent_activity(db_path)
        assert len(activity) == 1
        assert activity[0]["event_type"] == "device_new"

    def test_empty_before_any_scan(self, tmp_path):
        db_path = str(tmp_path / "devices.db")
        assert get_recent_activity(db_path) == []
