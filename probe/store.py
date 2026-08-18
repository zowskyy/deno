"""JSON event store backed by SQLite — append-only history of probe reports."""

from __future__ import annotations

import json
import sqlite3
import shutil
from datetime import datetime, timedelta
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    mode TEXT NOT NULL,
    wan_interface TEXT NOT NULL,
    finding_count INTEGER NOT NULL,
    top_finding_category TEXT,
    top_finding_confidence REAL,
    report_json TEXT NOT NULL,
    is_summary INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    records_deleted INTEGER,
    bytes_reclaimed INTEGER,
    details TEXT
);
"""


def open_store(db_path: str | Path) -> sqlite3.Connection:
    """Open (creating if needed) the SQLite event store at *db_path*."""
    conn = sqlite3.connect(str(db_path))
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def save_report(conn: sqlite3.Connection, report: dict) -> int:
    """Append *report* to the store and return its row id."""
    findings = report.get("findings", [])
    top = findings[0] if findings else None
    cur = conn.execute(
        "INSERT INTO reports "
        "(timestamp, mode, wan_interface, finding_count, "
        " top_finding_category, top_finding_confidence, report_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            report.get("timestamp"),
            report.get("latency", {}).get("mode", "unknown"),
            report.get("interface", {}).get("name", "unknown"),
            len(findings),
            top["category"] if top else None,
            top["confidence"] if top else None,
            json.dumps(report),
        ),
    )
    conn.commit()
    return cur.lastrowid


def _row_to_summary(row: tuple) -> dict:
    return {
        "id": row[0],
        "timestamp": row[1],
        "mode": row[2],
        "wan_interface": row[3],
        "finding_count": row[4],
        "top_finding_category": row[5],
        "top_finding_confidence": row[6],
    }


def list_reports(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    """Return the *limit* most recent report summaries, newest first."""
    cur = conn.execute(
        "SELECT id, timestamp, mode, wan_interface, finding_count, "
        "top_finding_category, top_finding_confidence "
        "FROM reports ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    return [_row_to_summary(row) for row in cur.fetchall()]


def get_report(conn: sqlite3.Connection, report_id: int) -> dict | None:
    """Return the full report dict for *report_id*, or None if not found."""
    cur = conn.execute("SELECT report_json FROM reports WHERE id = ?", (report_id,))
    row = cur.fetchone()
    if row is None:
        return None
    report = json.loads(row[0])
    report["_id"] = report_id
    return report


def latest_report(conn: sqlite3.Connection) -> dict | None:
    """Return the most recently saved report, or None if the store is empty."""
    cur = conn.execute("SELECT id FROM reports ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    if row is None:
        return None
    return get_report(conn, row[0])


def get_storage_status(conn: sqlite3.Connection, db_path: str | Path) -> dict:
    """Return database and free disk space status."""
    db_path = Path(db_path)
    db_bytes = db_path.stat().st_size if db_path.exists() else 0

    stat = shutil.disk_usage(db_path.parent)
    free_bytes = stat.free

    cur = conn.execute("SELECT MIN(timestamp) FROM reports WHERE is_summary = 0")
    row = cur.fetchone()
    oldest = row[0] if row and row[0] else None

    return {
        "database_bytes": db_bytes,
        "free_bytes": free_bytes,
        "oldest_full_report": oldest,
        "retention_status": "healthy" if free_bytes > db_bytes * 2 else "low_space",
    }


def apply_retention(conn: sqlite3.Connection, config) -> dict:
    """Apply retention policy: delete old samples, compact.
    Returns maintenance event summary."""
    from .config import RetentionConfig

    if not isinstance(config, RetentionConfig):
        config = RetentionConfig()

    now = datetime.utcnow()
    cutoff_raw = (now - timedelta(days=config.raw_sample_days)).isoformat()
    cutoff_full = (now - timedelta(days=config.full_report_days)).isoformat()

    records_deleted = 0
    bytes_before = Path(conn.execute("PRAGMA database_list").fetchone()[2]).stat().st_size

    # Delete raw samples older than retention
    cur = conn.execute(
        "DELETE FROM reports WHERE is_summary = 0 AND timestamp < ?",
        (cutoff_raw,)
    )
    records_deleted += cur.rowcount

    conn.commit()

    # Compact if fragmentation threshold exceeded
    page_count = conn.execute("PRAGMA page_count").fetchone()[0]
    free_pages = conn.execute("PRAGMA freelist_count").fetchone()[0]
    if free_pages > 0:
        frag_percent = (free_pages / page_count) * 100 if page_count > 0 else 0
        if frag_percent > config.vacuum_threshold_percent:
            try:
                conn.execute("VACUUM")
                conn.commit()
            except sqlite3.OperationalError:
                pass

    bytes_after = Path(conn.execute("PRAGMA database_list").fetchone()[2]).stat().st_size
    bytes_reclaimed = max(0, bytes_before - bytes_after)

    event = {
        "timestamp": now.isoformat() + "Z",
        "event_type": "retention_cleanup",
        "records_deleted": records_deleted,
        "bytes_reclaimed": bytes_reclaimed,
        "details": f"Deleted {records_deleted} old samples, reclaimed {bytes_reclaimed} bytes",
    }

    try:
        conn.execute(
            "INSERT INTO maintenance_events "
            "(timestamp, event_type, records_deleted, bytes_reclaimed, details) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                event["timestamp"],
                event["event_type"],
                event["records_deleted"],
                event["bytes_reclaimed"],
                event["details"],
            ),
        )
        conn.commit()
    except sqlite3.OperationalError:
        pass

    return event
