"""JSON event store backed by SQLite — append-only history of probe reports."""

from __future__ import annotations

import json
import sqlite3
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
    report_json TEXT NOT NULL
);
"""


def open_store(db_path: str | Path) -> sqlite3.Connection:
    """Open (creating if needed) the SQLite event store at *db_path*."""
    conn = sqlite3.connect(str(db_path))
    conn.execute(SCHEMA)
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
