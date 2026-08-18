"""Integration tests for the read-only local HTTP API + dashboard."""

import json
import threading
import urllib.error
import urllib.request

import pytest

from probe.api import create_server
from probe.store import open_store, save_report


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
