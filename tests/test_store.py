"""Tests for the SQLite-backed JSON event store."""

import json
from pathlib import Path

import pytest

from probe.store import get_report, latest_report, list_reports, open_store, save_report

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
