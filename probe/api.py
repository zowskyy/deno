"""Minimal, dependency-free local HTTP API + dashboard.

Serves report history from the SQLite event store (probe.store), and
optionally the device inventory from probe.device_history. Read-only:
there are no mutating endpoints, matching Phase 1's "observe and recommend,
never change firewall or QoS settings" contract. Uses only the standard
library so the gateway does not need extra packages installed.

Every request connects to the relevant store in SQLite's read-only URI
mode, so this process never needs write access to either database file —
it can run under a systemd/procd read-only bind mount, and it never runs
retention/compaction or device scans itself (that's probe.cli's and
probe.devices_cli's job, since only the writer processes are guaranteed
write access to the stores).
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from . import device_history as device_history_mod
from . import store as store_mod

STATIC_DIR = Path(__file__).parent / "static"
DEFAULT_PORT = 8734
DEFAULT_HOST = "127.0.0.1"


def _connect_readonly(db_path: str) -> sqlite3.Connection:
    """Open *db_path* read-only via SQLite's URI mode.

    Never requests SQLITE_OPEN_CREATE/READWRITE, so this works even when the
    file lives on a read-only bind mount (systemd ReadOnlyPaths / a
    read-only OpenWrt overlay). Raises sqlite3.OperationalError if the file
    does not exist yet or genuinely cannot be opened.
    """
    return sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)


def _make_handler(db_path: str, device_db_path: str | None = None) -> type[BaseHTTPRequestHandler]:
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

            if path in ("/", "/index.html"):
                self._send_html((STATIC_DIR / "dashboard.html").read_text())
                return

            if path == "/api/devices":
                self._handle_devices()
                return

            try:
                conn = _connect_readonly(db_path)
            except sqlite3.OperationalError:
                self._send_json(
                    {"error": "report store is not available yet — no probe has run"},
                    status=503,
                )
                return

            try:
                if path == "/api/reports":
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

        def _handle_devices(self) -> None:
            """Serve the last-known device inventory (see probe.device_history).

            Separate connection/db from the report store on purpose — a
            missing or unreadable device store is reported as "not
            configured yet," not treated as an error, since running
            gateway-probe-devices at all is optional.
            """
            if device_db_path is None:
                self._send_json({"configured": False, "available": False, "devices": [], "recent_events": []})
                return

            try:
                conn = _connect_readonly(device_db_path)
            except sqlite3.OperationalError:
                self._send_json({"configured": True, "available": False, "devices": [], "recent_events": []})
                return

            try:
                devices = device_history_mod.list_known_devices(conn)
                events = device_history_mod.list_recent_events(conn, limit=20)
                self._send_json({
                    "configured": True,
                    "available": True,
                    "device_count": len(devices),
                    "devices": devices,
                    "recent_events": events,
                })
            finally:
                conn.close()

    return Handler


def create_server(
    db_path: str,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    device_db_path: str | None = None,
) -> ThreadingHTTPServer:
    """Build (but do not start) the read-only API/dashboard server.

    *device_db_path* is optional — pass it to also serve /api/devices from
    a probe.device_history baseline (written by gateway-probe-devices
    --store). Without it, /api/devices reports "not configured" rather
    than 404, since running the device inventory at all is optional.
    """
    # Best-effort schema init for convenience (e.g. running the dashboard
    # before any probe has ever written a report on a writable filesystem).
    # This is NOT required for the server to work — do_GET always opens the
    # store read-only — so a failure here (missing file, read-only mount,
    # permission denied) is not fatal; the API will simply return 503 until
    # a writer creates the store.
    try:
        store_mod.open_store(db_path).close()
    except (sqlite3.OperationalError, sqlite3.DatabaseError, OSError) as exc:
        print(
            f"[gateway-probe-serve] warning: could not initialize schema at "
            f"{db_path} ({exc}); will serve once a writer creates it",
            file=sys.stderr,
        )
    handler_cls = _make_handler(db_path, device_db_path)
    return ThreadingHTTPServer((host, port), handler_cls)


def serve(
    db_path: str,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    device_db_path: str | None = None,
) -> None:
    """Start the API/dashboard server and block until interrupted.

    This process is independent of probe collection: stopping it never
    affects traffic forwarding, and it does not run probes itself — it only
    reads whatever probe.cli (or another writer) has appended to the store.
    """
    server = create_server(db_path, host, port, device_db_path)
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
    parser.add_argument(
        "--device-store",
        metavar="FILE",
        default=None,
        help="Device-baseline SQLite file (from gateway-probe-devices --store) to also serve at /api/devices (optional).",
    )
    parser.add_argument(
        "--host",
        default=None,
        help=f"Bind address (default: {DEFAULT_HOST}, or api.bind_address from --config)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help=f"Bind port (default: {DEFAULT_PORT}, or api.port from --config)",
    )
    parser.add_argument(
        "--config",
        metavar="FILE",
        default=None,
        help="Load host/port defaults from this TOML config file (optional).",
    )
    args = parser.parse_args(argv)

    host = args.host
    port = args.port

    if args.config:
        from .config import GatewayProbeConfig

        cfg = GatewayProbeConfig.from_toml(args.config)
        if host is None:
            host = cfg.api.bind_address
        if port is None:
            port = cfg.api.port

    if host is None:
        host = DEFAULT_HOST
    if port is None:
        port = DEFAULT_PORT

    serve(args.store, host, port, args.device_store)
    return 0


if __name__ == "__main__":
    sys.exit(main())
