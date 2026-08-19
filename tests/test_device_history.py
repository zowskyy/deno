"""Tests for the device-baseline store: new-vs-known diffing across scans."""

from __future__ import annotations

from probe.device_history import diff_and_save, list_known_devices, list_recent_events, open_device_store

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

    def test_present_field_reflects_current_state(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-01T00:00:00Z")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-02T00:00:00Z")  # UNKNOWN_DEVICE goes missing

        stored = {d["mac"]: d for d in list_known_devices(conn)}
        assert stored["3C:5A:B4:12:34:56"]["present"] is True
        assert stored["11:22:33:44:55:66"]["present"] is False


class TestPresenceEvents:
    """The activity timeline: device_new / device_returned / device_missing.
    Deliberately a separate signal from new_devices (see module docstring)
    — these tests lock in that the two never get conflated."""

    def test_first_scan_logs_no_events(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff = diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-01T00:00:00Z")
        assert diff["events"] == []
        assert list_recent_events(conn) == []

    def test_device_going_missing_logs_exactly_one_event(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-01T00:00:00Z")
        diff = diff_and_save(conn, [APPLE_DEVICE], "2026-01-02T00:00:00Z")

        assert diff["missing_devices"] == ["11:22:33:44:55:66"]
        assert len(diff["events"]) == 1
        assert diff["events"][0]["event_type"] == "device_missing"
        assert diff["events"][0]["mac"] == "11:22:33:44:55:66"

    def test_missing_device_does_not_refire_event_on_every_subsequent_scan(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-01T00:00:00Z")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-02T00:00:00Z")  # goes missing here
        diff3 = diff_and_save(conn, [APPLE_DEVICE], "2026-01-03T00:00:00Z")  # still missing
        diff4 = diff_and_save(conn, [APPLE_DEVICE], "2026-01-04T00:00:00Z")  # still missing

        # Only one device_missing event total, from the actual transition —
        # not one per scan it stays absent.
        events = list_recent_events(conn)
        missing_events = [e for e in events if e["event_type"] == "device_missing"]
        assert len(missing_events) == 1
        assert diff3["missing_devices"] == []
        assert diff4["missing_devices"] == []

    def test_device_returning_logs_returned_event_not_new(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-01T00:00:00Z")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-02T00:00:00Z")  # UNKNOWN_DEVICE missing
        diff3 = diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-03T00:00:00Z")  # returns

        assert len(diff3["events"]) == 1
        assert diff3["events"][0]["event_type"] == "device_returned"
        assert diff3["events"][0]["mac"] == "11:22:33:44:55:66"
        # Critical: a returning device must NOT also show up in new_devices —
        # it's known hardware, just re-appearing, not brand new.
        assert diff3["new_devices"] == []

    def test_brand_new_device_logs_device_new_event(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-01T00:00:00Z")
        diff2 = diff_and_save(conn, [APPLE_DEVICE, THIRD_DEVICE], "2026-01-02T00:00:00Z")

        assert len(diff2["events"]) == 1
        assert diff2["events"][0]["event_type"] == "device_new"
        assert diff2["events"][0]["mac"] == "AA:BB:CC:DD:EE:FF"
        assert diff2["new_devices"][0]["mac"] == "AA:BB:CC:DD:EE:FF"

    def test_device_present_every_scan_never_generates_events(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-01T00:00:00Z")
        diff2 = diff_and_save(conn, [APPLE_DEVICE], "2026-01-02T00:00:00Z")
        diff3 = diff_and_save(conn, [APPLE_DEVICE], "2026-01-03T00:00:00Z")

        assert diff2["events"] == []
        assert diff3["events"] == []
        assert list_recent_events(conn) == []

    def test_full_lifecycle_join_missing_return(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-01T00:00:00Z")  # baseline
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-02T00:00:00Z")  # joins
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-03T00:00:00Z")  # goes missing
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-04T00:00:00Z")  # returns

        events = list_recent_events(conn)  # newest first
        event_types = [e["event_type"] for e in events]
        assert event_types == ["device_returned", "device_missing", "device_new"]


class TestListRecentEvents:
    def test_empty_store_returns_empty_list(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        assert list_recent_events(conn) == []

    def test_respects_limit(self, tmp_path):
        conn = open_device_store(tmp_path / "devices.db")
        diff_and_save(conn, [APPLE_DEVICE], "2026-01-01T00:00:00Z")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE], "2026-01-02T00:00:00Z")
        diff_and_save(conn, [APPLE_DEVICE, UNKNOWN_DEVICE, THIRD_DEVICE], "2026-01-03T00:00:00Z")

        assert len(list_recent_events(conn, limit=1)) == 1
