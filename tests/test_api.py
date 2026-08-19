"""Integration tests for the read-only local HTTP API + dashboard."""

import json
import sqlite3
import threading
import urllib.error
import urllib.request

import pytest

from probe.api import _connect_readonly, create_server
from probe.store import get_report, open_store, save_report


@pytest.fixture
def running_server(tmp_path):
    db_path = tmp_path / "events.db"
    server = create_server(str(db_path), host="127.0.0.1", port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    yield f"http://127.0.0.1:{port}", db_path
    server.shutdown()
    server.server_close()


def _get(url):
    with urllib.request.urlopen(url, timeout=5) as resp:
        return resp.status, json.loads(resp.read())


class TestReadOnlyEndpoints:
    def test_dashboard_root_serves_html(self, running_server):
        base_url, _ = running_server
        with urllib.request.urlopen(base_url + "/", timeout=5) as resp:
            body = resp.read().decode("utf-8")
        assert resp.status == 200
        assert "gateway-probe" in body

    def test_latest_report_empty_store_returns_404(self, running_server):
        base_url, _ = running_server
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(base_url + "/api/reports/latest", timeout=5)
        assert exc_info.value.code == 404

    def test_reports_list_empty_store_returns_empty_array(self, running_server):
        base_url, _ = running_server
        status, body = _get(base_url + "/api/reports")
        assert status == 200
        assert body["reports"] == []
        assert "storage" in body
        assert body["storage"]["retention_status"] == "healthy"

    def test_latest_report_reflects_stored_report(self, running_server):
        base_url, db_path = running_server
        conn = open_store(db_path)
        save_report(conn, {
            "schema_version": "0.1",
            "timestamp": "2026-08-18T21:40:00Z",
            "interface": {"name": "eth0.2", "carrier": True},
            "latency": {"mode": "idle"},
            "findings": [],
        })
        conn.close()

        status, body = _get(base_url + "/api/reports/latest")
        assert status == 200
        assert body["interface"]["name"] == "eth0.2"

    def test_report_by_id_returns_full_report(self, running_server):
        base_url, db_path = running_server
        conn = open_store(db_path)
        row_id = save_report(conn, {
            "schema_version": "0.1",
            "timestamp": "2026-08-18T21:40:00Z",
            "interface": {"name": "eth0.2", "carrier": True},
            "latency": {"mode": "idle"},
            "findings": [],
        })
        conn.close()

        status, body = _get(f"{base_url}/api/reports/{row_id}")
        assert status == 200
        assert body["_id"] == row_id

    def test_unknown_report_id_returns_404(self, running_server):
        base_url, _ = running_server
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(base_url + "/api/reports/9999", timeout=5)
        assert exc_info.value.code == 404

    def test_unknown_path_returns_404(self, running_server):
        base_url, _ = running_server
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(base_url + "/nonexistent", timeout=5)
        assert exc_info.value.code == 404

    def test_no_mutating_http_methods_are_handled(self, running_server):
        base_url, _ = running_server
        req = urllib.request.Request(base_url + "/api/reports", method="POST")
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req, timeout=5)
        # BaseHTTPRequestHandler returns 501 for unimplemented methods (no do_POST defined)
        assert exc_info.value.code == 501


class TestReadOnlyConnection:
    """Regression coverage for the read-only-mount fix: the API must open
    the store with SQLite's mode=ro, which SQLite enforces at the library
    level (unlike OS file permissions, this holds even for a root process),
    and must never attempt to write through that connection."""

    def test_readonly_connection_rejects_writes(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        save_report(conn, {
            "schema_version": "0.1",
            "timestamp": "2026-08-18T21:40:00Z",
            "interface": {"name": "eth0.2", "carrier": True},
            "latency": {"mode": "idle"},
            "findings": [],
        })
        conn.close()

        ro_conn = _connect_readonly(str(db_path))
        try:
            with pytest.raises(sqlite3.OperationalError):
                ro_conn.execute(
                    "INSERT INTO reports "
                    "(timestamp, mode, wan_interface, finding_count, report_json) "
                    "VALUES ('x', 'x', 'x', 0, '{}')"
                )
        finally:
            ro_conn.close()

    def test_readonly_connection_can_still_read(self, tmp_path):
        db_path = tmp_path / "events.db"
        conn = open_store(db_path)
        row_id = save_report(conn, {
            "schema_version": "0.1",
            "timestamp": "2026-08-18T21:40:00Z",
            "interface": {"name": "eth0.2", "carrier": True},
            "latency": {"mode": "idle"},
            "findings": [],
        })
        conn.close()

        ro_conn = _connect_readonly(str(db_path))
        try:
            report = get_report(ro_conn, row_id)
            assert report is not None
            assert report["interface"]["name"] == "eth0.2"
        finally:
            ro_conn.close()

    def test_missing_database_raises_operational_error(self, tmp_path):
        missing = tmp_path / "does-not-exist.db"
        with pytest.raises(sqlite3.OperationalError):
            _connect_readonly(str(missing))


class TestStoreNotYetCreated:
    """The dashboard may start before any probe has written a report — or
    on a read-only mount where schema init in create_server is expected to
    fail. Neither should crash the server; requests should 503 instead."""

    def test_server_does_not_crash_when_store_cannot_be_created(self, tmp_path):
        # A path inside a nonexistent directory: sqlite3.connect cannot
        # create the file, so create_server's best-effort schema init fails
        # — this must be swallowed, not raised.
        unreachable_db = tmp_path / "nonexistent_subdir" / "events.db"
        server = create_server(str(unreachable_db), host="127.0.0.1", port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        try:
            with pytest.raises(urllib.error.HTTPError) as exc_info:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/api/reports", timeout=5)
            assert exc_info.value.code == 503
        finally:
            server.shutdown()
            server.server_close()

    def test_dashboard_root_still_serves_when_store_unavailable(self, tmp_path):
        unreachable_db = tmp_path / "nonexistent_subdir" / "events.db"
        server = create_server(str(unreachable_db), host="127.0.0.1", port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=5) as resp:
                assert resp.status == 200
        finally:
            server.shutdown()
            server.server_close()


class TestDefaultBindAddress:
    def test_create_server_defaults_to_localhost(self, tmp_path):
        from probe.api import DEFAULT_HOST
        assert DEFAULT_HOST == "127.0.0.1"
