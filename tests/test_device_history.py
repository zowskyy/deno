"""Tests for the device-baseline store: new-vs-known diffing across scans."""

from __future__ import annotations

from probe.device_history import diff_and_save, list_known_devices, open_device_store

APPLE_DEVICE = {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}
UNKNOWN_DEVICE = {"ip": "192.168.1.6", "mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"}
THIRD_DEVICE = {"ip": "192.168.1.7", "mac": "AA:BB:CC:DD:EE:FF", "vendor": None, "type": "unknown_vendor"}


class TestFirstScan:
    def test_first_scan_marks_everything_as_known_not_new(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff = diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-01T00:00:00Z")

        assert diff["is_first_scan"] is True
        assert diff["new_devices"] == []
        assert len(diff["known_devices"]) == 2

    def test_first_scan_persists_all_devices(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-01T00:00:00Z")

        stored = list_known_devices(conn)
        assert len(stored) == 2


class TestSubsequentScans:
    def test_same_devices_again_are_not_flagged_new(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-01T00:00:00Z")

        diff = diff_and_save(conn, [APPLE_DEVICE], "2026-01-02T00:00:00Z")
        assert diff["is_first_scan"] is False
        assert diff["new_devices"] == []
        assert len(diff["known_devices"]) == 1

    def test_new_device_on_second_scan_is_flagged(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-01T00:00:00Z")

        diff = diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-02T00:00:00Z")
        assert diff["is_first_scan"] is False
        assert len(diff["new_devices"]) == 1
        assert diff["new_devices"][0]["mac"] == "11:22:33:44:55:66"
        assert len(diff["known_devices"]) == 1

    def test_device_that_disappears_stays_in_baseline_but_isnt_reflagged(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-01T00:00:00Z")

        # UNKNOWN_DEVICE isn't present this time (e.g. powered off)
        diff = diff_and_save(conn, [APPLE_DEVICE], "2026-01-02T00:00:00Z")
        assert diff["new_devices"] == []

        # It reappears on scan 3 — should NOT be re-flagged as new, since
        # it was already in the baseline from scan 1.
        diff3 = diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-03T00:00:00Z")
        assert diff3["new_devices"] == []

    def test_last_seen_updates_on_repeat_scan(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-01T00:00:00Z")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-02T00:00:00Z")

        stored = list_known_devices(conn)
        assert stored[0]["first_seen"] == "2026-01-01T00:00:00Z"
        assert stored[0]["last_seen"] == "2026-01-02T00:00:00Z"

    def test_idempotent_call_with_identical_input_finds_nothing_new(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE, THIRD_DEVICE], "2026-01-01T00:00:00Z")
        diff2 = diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE, THIRD_DEVICE], "2026-01-01T00:00:01Z")
        assert diff2["new_devices"] == []
        assert len(list_known_devices(conn)) == 3


class TestListKnownDevices:
    def test_ordered_most_recently_seen_first(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-01T00:00:00Z")
        diff_and_save(conn, [UNKNOWN_DEVICE], "2026-01-05T00:00:00Z")

        stored = list_known_devices(conn)
        assert stored[0]["mac"] == "11:22:33:44:55:66"
        assert stored[1]["mac"] == "3C:5A:B4:12:34:56"

    def test_empty_store_returns_empty_list(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        assert list_known_devices(conn) == []
