"""Tests for the SQLite-backed JSON event store."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from probe.config import RetentionConfig
from probe.store import (
    apply_retention,
    get_report,
    get_storage_status,
    latest_report,
    list_reports,
    open_store,
    save_report,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _sample_report(**overrides) -> dict:
    report = json.loads((FIXTURE_DIR / "sample_report.json").read_text())
    report.update(overrides)
    return report


class TestSaveAndRetrieve:
    def test_save_report_returns_incrementing_ids(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        id1 = save_report(conn, _sample_report())
        id2 = save_report(conn, _sample_report())
        assert id2 == id1 + 1

    def test_get_report_round_trips_full_content(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        original = _sample_report()
        row_id = save_report(conn, original)

        fetched = get_report(conn, row_id)
        assert fetched is not None
        assert fetched["schema_version"] == original["schema_version"]
        assert fetched["interface"]["name"] == original["interface"]["name"]
        assert fetched["_id"] == row_id

    def test_get_report_missing_id_returns_none(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        assert get_report(conn, 9999) is None


class TestListReports:
    def test_list_reports_orders_newest_first(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        first = save_report(conn, _sample_report())
        second = save_report(conn, _sample_report())

        summaries = list_reports(conn)
        assert [s["id"] for s in summaries] == [second, first]

    def test_list_reports_respects_limit(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        for _ in range(5):
            save_report(conn, _sample_report())

        summaries = list_reports(conn, limit=2)
        assert len(summaries) == 2

    def test_list_reports_empty_store_returns_empty_list(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        assert list_reports(conn) == []

    def test_summary_includes_top_finding(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        report = _sample_report(findings=[
            {"category": "physical_link", "confidence": 0.99, "reason": "no carrier"},
        ])
        save_report(conn, report)

        summaries = list_reports(conn)
        assert summaries[0]["top_finding_category"] == "physical_link"
        assert summaries[0]["finding_count"] == 1


class TestLatestReport:
    def test_latest_report_returns_none_when_empty(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        assert latest_report(conn) is None

    def test_latest_report_returns_most_recent(self, tmp_path):
        conn = open_store(tmp_path / "events.db")
        save_report(conn, _sample_report(timestamp="2026-01-01T00:00:00Z"))
        second_id = save_report(conn, _sample_report(timestamp="2026-01-02T00:00:00Z"))

        latest = latest_report(conn)
        assert latest is not None
        assert latest["_id"] == second_id
        assert latest["timestamp"] == "2026-01-02T00:00:00Z"


class TestPersistence:
    def test_store_persists_across_reopen(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn1 = open_store(db_path)
        row_id = save_report(conn1, _sample_report())
        conn1.close()

        conn2 = open_store(db_path)
        fetched = get_report(conn2, row_id)
        assert fetched is not None


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


class TestGetStorageStatus:
    def test_reports_healthy_when_space_available(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        save_report(conn, _sample_report())
        status = get_storage_status(conn, db_path)
        assert status["retention_status"] == "healthy"
        assert status["database_bytes"] > 0

    def test_reports_low_space_when_disk_nearly_full(self, tmp_path, monkeypatch):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        save_report(conn, _sample_report())

        import shutil as shutil_mod

        fake_usage = type("Usage", (), {"total": 0, "used": 0, "free": 1})()
        monkeypatch.setattr(shutil_mod, "disk_usage", lambda _path: fake_usage)

        status = get_storage_status(conn, db_path)
        assert status["retention_status"] == "low_space"

    def test_oldest_full_report_reflects_earliest_timestamp(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        save_report(conn, _sample_report(timestamp="2026-01-01T00:00:00Z"))
        save_report(conn, _sample_report(timestamp="2026-01-05T00:00:00Z"))
        status = get_storage_status(conn, db_path)
        assert status["oldest_full_report"] == "2026-01-01T00:00:00Z"


class TestApplyRetention:
    def test_recent_reports_are_not_touched(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        save_report(conn, _sample_report(timestamp=_iso_days_ago(1)))

        apply_retention(conn, db_path, RetentionConfig(full_report_days=30))

        summaries = list_reports(conn)
        assert len(summaries) == 1
        assert summaries[0]["mode"] != "summary"

    def test_old_reports_are_summarized_and_originals_deleted(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        old_id = save_report(conn, _sample_report(timestamp=_iso_days_ago(45)))

        event = apply_retention(conn, db_path, RetentionConfig(full_report_days=30))

        assert event["records_deleted"] >= 1
        assert get_report(conn, old_id) is None

        cur = conn.execute("SELECT COUNT(*) FROM reports WHERE is_summary = 1")
        assert cur.fetchone()[0] == 1

    def test_summarization_is_idempotent(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        save_report(conn, _sample_report(timestamp=_iso_days_ago(45)))
        save_report(conn, _sample_report(timestamp=_iso_days_ago(46)))

        apply_retention(conn, db_path, RetentionConfig(full_report_days=30))
        apply_retention(conn, db_path, RetentionConfig(full_report_days=30))

        cur = conn.execute("SELECT COUNT(*) FROM reports WHERE is_summary = 1")
        # Both old reports fall on different days-ago but summarization
        # should not create duplicate summary rows per day on a second run.
        assert cur.fetchone()[0] <= 2

    def test_summaries_older_than_daily_summary_days_are_deleted(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        conn.execute(
            "INSERT INTO reports "
            "(timestamp, mode, wan_interface, finding_count, "
            " top_finding_category, top_finding_confidence, report_json, is_summary) "
            "VALUES (?, 'summary', '', 5, NULL, NULL, '{}', 1)",
            (_iso_days_ago(200),),
        )
        conn.commit()

        apply_retention(conn, db_path, RetentionConfig(full_report_days=30, daily_summary_days=180))

        cur = conn.execute("SELECT COUNT(*) FROM reports WHERE is_summary = 1")
        assert cur.fetchone()[0] == 0

    def test_max_report_count_deletes_oldest_first(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        ids = [save_report(conn, _sample_report(timestamp=_iso_days_ago(i))) for i in range(10, 0, -1)]

        apply_retention(conn, db_path, RetentionConfig(full_report_days=9999, max_report_count=3))

        remaining = conn.execute("SELECT COUNT(*) FROM reports WHERE is_summary = 0").fetchone()[0]
        assert remaining == 3
        # The most recent report (smallest days-ago -> last in `ids`) must survive.
        assert get_report(conn, ids[-1]) is not None

    def test_returns_maintenance_event_summary(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        save_report(conn, _sample_report())

        event = apply_retention(conn, db_path, RetentionConfig())

        assert event["event_type"] == "retention_cleanup"
        assert "records_deleted" in event
        assert "bytes_reclaimed" in event

    def test_defaults_used_when_config_is_none(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        save_report(conn, _sample_report())
        # Should not raise, and should behave like RetentionConfig()
        event = apply_retention(conn, db_path, None)
        assert event["event_type"] == "retention_cleanup"
