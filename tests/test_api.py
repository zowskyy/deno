"""Integration tests for the read-only local HTTP API + dashboard."""

import json
import sqlite3
import threading
import urllib.error
import urllib.request

import pytest

from probe.api import _connect_readonly, create_server
from probe.device_history import diff_and_save, open_device_store
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


@pytest.fixture
def running_server_with_devices(tmp_path):
    db_path = tmp_path / "events.db"
    device_db_path = tmp_path / "devices.db"
    server = create_server(str(db_path), host="127.0.0.1", port=0, device_db_path=str(device_db_path))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    yield f"http://127.0.0.1:{port}", device_db_path
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


class TestStoreParentDirectoryMissing:
    """When --store's parent directory doesn't exist, no writer
    (gateway-probe --store) can create the file there either — the old
    "will serve once a writer creates it" message was misleading in
    exactly this case. Verify the warning is now accurate."""

    def test_warns_that_no_writer_can_help_when_parent_dir_missing(self, tmp_path, capsys):
        unreachable_db = tmp_path / "nonexistent_subdir" / "events.db"
        server = create_server(str(unreachable_db), host="127.0.0.1", port=0)
        server.server_close()

        err = capsys.readouterr().err
        assert "error:" in err
        assert "does not exist" in err
        assert "no writer" in err

    def test_still_warns_will_serve_when_parent_dir_exists_but_file_cannot_open(self, tmp_path, capsys):
        # Parent directory exists, but the path itself is a directory —
        # sqlite3.connect fails, yet a writer creating a *different* valid
        # file there could still eventually work, so keep the original
        # "will serve once a writer creates it" framing here.
        db_as_dir = tmp_path / "events.db"
        db_as_dir.mkdir()
        server = create_server(str(db_as_dir), host="127.0.0.1", port=0)
        server.server_close()

        err = capsys.readouterr().err
        assert "will serve once a writer creates it" in err


class TestDefaultBindAddress:
    def test_create_server_defaults_to_localhost(self, tmp_path):
        from probe.api import DEFAULT_HOST
        assert DEFAULT_HOST == "127.0.0.1"


class TestDevicesEndpoint:
    def test_not_configured_when_no_device_store_given(self, running_server):
        base_url, _ = running_server  # plain fixture: no device_db_path passed
        status, body = _get(base_url + "/api/devices")
        assert status == 200
        assert body["configured"] is False
        assert body["devices"] == []

    def test_configured_but_unavailable_before_any_scan(self, running_server_with_devices):
        base_url, _ = running_server_with_devices
        status, body = _get(base_url + "/api/devices")
        assert status == 200
        assert body["configured"] is True
        assert body["available"] is False
        assert body["devices"] == []

    def test_corrupt_device_store_degrades_gracefully_not_crash(self, running_server_with_devices):
        # Regression: SQLite lazily opens files, so a file that exists but
        # isn't a valid database doesn't fail at connect() — it fails on
        # the first query, with sqlite3.DatabaseError (not a subclass of
        # OperationalError). The handler must catch both, not just the
        # connect-time error.
        base_url, device_db_path = running_server_with_devices
        device_db_path.write_bytes(b"this is not a sqlite database")

        status, body = _get(base_url + "/api/devices")
        assert status == 200
        assert body["configured"] is True
        assert body["available"] is False

    def test_reflects_saved_device_baseline(self, running_server_with_devices):
        base_url, device_db_path = running_server_with_devices
        conn = open_device_store(device_db_path)
        diff_and_save(
            conn,
            [{"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}],
            "2026-01-01T00:00:00Z",
        )
        conn.close()

        status, body = _get(base_url + "/api/devices")
        assert status == 200
        assert body["configured"] is True
        assert body["available"] is True
        assert body["device_count"] == 1
        assert body["devices"][0]["mac"] == "3C:5A:B4:12:34:56"
        assert body["devices"][0]["vendor"] == "Apple"

    def test_includes_recent_events_across_scans(self, running_server_with_devices):
        base_url, device_db_path = running_server_with_devices
        conn = open_device_store(device_db_path)
        diff_and_save(
            conn,
            [{"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}],
            "2026-01-01T00:00:00Z",
        )
        diff_and_save(
            conn,
            [
                {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"},
                {"ip": "192.168.1.6", "mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor"},
            ],
            "2026-01-02T00:00:00Z",
        )
        conn.close()

        status, body = _get(base_url + "/api/devices")
        assert status == 200
        assert len(body["recent_events"]) == 1
        assert body["recent_events"][0]["event_type"] == "device_new"

    def test_reports_endpoint_still_works_alongside_devices(self, running_server_with_devices):
        # Regression guard: adding /api/devices must not disturb the
        # existing report-store handling in the same do_GET.
        base_url, _ = running_server_with_devices
        status, body = _get(base_url + "/api/reports")
        assert status == 200
        assert body["reports"] == []

    def test_devices_endpoint_never_writes_through_readonly_connection(self, running_server_with_devices):
        # The device store doesn't exist yet on disk at all here, so if the
        # handler tried to write (e.g. accidentally calling open_device_store
        # instead of a read-only connect), this would either create the file
        # or raise something other than the expected graceful 200 response.
        base_url, device_db_path = running_server_with_devices
        status, body = _get(base_url + "/api/devices")
        assert status == 200
        assert body["available"] is False
        assert not device_db_path.exists()
