"""Minimal, dependency-free local HTTP API + dashboard.

Serves report history from the SQLite event store (probe.store). Read-only:
there are no mutating endpoints, matching Phase 1's "observe and recommend,
never change firewall or QoS settings" contract. Uses only the standard
library so the gateway does not need extra packages installed.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from . import store as store_mod

STATIC_DIR = Path(__file__).parent / "static"
DEFAULT_PORT = 8734


def _make_handler(db_path: str) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:  # silence default access logging
            pass

        def _send_json(self, payload, status: int = 200) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_html(self, text: str, status: int = 200) -> None:
            body = text.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802 (stdlib method name)
            path = urlparse(self.path).path
            conn = sqlite3.connect(db_path)
            try:
                if path in ("/", "/index.html"):
                    self._send_html((STATIC_DIR / "dashboard.html").read_text())
                elif path == "/api/reports":
                    from .config import RetentionConfig
                    try:
                        store_mod.apply_retention(conn, RetentionConfig())
                    except Exception:
                        pass
                    status = store_mod.get_storage_status(conn, db_path)
                    self._send_json({
                        "storage": status,
                        "reports": store_mod.list_reports(conn, limit=100),
                    })
                elif path == "/api/reports/latest":
                    report = store_mod.latest_report(conn)
                    if report is None:
                        self._send_json({"error": "no reports yet"}, status=404)
                    else:
                        self._send_json(report)
                elif path.startswith("/api/reports/"):
                    raw_id = path.rsplit("/", 1)[-1]
                    try:
                        report_id = int(raw_id)
                    except ValueError:
                        self._send_json({"error": "invalid report id"}, status=400)
                        return
                    report = store_mod.get_report(conn, report_id)
                    if report is None:
                        self._send_json({"error": "not found"}, status=404)
                    else:
                        self._send_json(report)
                else:
                    self._send_json({"error": "not found"}, status=404)
            finally:
                conn.close()

    return Handler


def create_server(db_path: str, host: str = "0.0.0.0", port: int = DEFAULT_PORT) -> ThreadingHTTPServer:
    """Build (but do not start) the read-only API/dashboard server."""
    # Ensure the schema exists before any request handler connects, in case
    # this server is started before probe.cli has ever written a report.
    store_mod.open_store(db_path).close()
    handler_cls = _make_handler(db_path)
    return ThreadingHTTPServer((host, port), handler_cls)


def serve(db_path: str, host: str = "0.0.0.0", port: int = DEFAULT_PORT) -> None:
    """Start the API/dashboard server and block until interrupted.

    This process is independent of probe collection: stopping it never
    affects traffic forwarding, and it does not run probes itself — it only
    reads whatever probe.cli (or another writer) has appended to the store.
    """
    server = create_server(db_path, host, port)
    print(f"[gateway-probe] dashboard + API listening on http://{host}:{port}", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gateway-probe-serve",
        description="Local read-only HTTP API + dashboard for gateway-probe reports.",
    )
    parser.add_argument("--store", required=True, metavar="FILE", help="SQLite event-store file to serve")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Bind port (default: {DEFAULT_PORT})")
    args = parser.parse_args(argv)

    serve(args.store, args.host, args.port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
