"""JSON event store backed by SQLite — append-only history of probe reports."""

from __future__ import annotations

import json
import sqlite3
import shutil
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

MAINTENANCE_BATCH_SIZE = 50
MIN_REPORTS_KEPT = 5  # never delete below this floor when enforcing size caps

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


def _summarize_old_reports(conn: sqlite3.Connection, cutoff_iso: str) -> int:
    """Aggregate full reports older than *cutoff_iso* into one daily-summary
    row per calendar day, then delete the originals. Returns rows deleted.

    A day already represented by a summary row is skipped (idempotent), so
    calling this repeatedly as new reports age past the cutoff only ever
    summarizes the newly-eligible days.
    """
    cur = conn.execute(
        "SELECT id, timestamp, finding_count, top_finding_category FROM reports "
        "WHERE is_summary = 0 AND timestamp < ? ORDER BY timestamp",
        (cutoff_iso,),
    )
    rows = cur.fetchall()
    if not rows:
        return 0

    by_day: dict[str, list[tuple]] = {}
    for row in rows:
        day = row[1][:10]  # "YYYY-MM-DD" prefix of the ISO timestamp
        by_day.setdefault(day, []).append(row)

    ids_to_delete: list[int] = []
    for day, day_rows in by_day.items():
        day_start = f"{day}T00:00:00+00:00"
        existing = conn.execute(
            "SELECT id FROM reports WHERE is_summary = 1 AND timestamp = ?",
            (day_start,),
        ).fetchone()
        if existing:
            # Already summarized (e.g. a previous run summarized part of
            # this day) — just drop the now-redundant originals.
            ids_to_delete.extend(r[0] for r in day_rows)
            continue

        count = len(day_rows)
        avg_findings = sum(r[2] for r in day_rows) / count
        categories = [r[3] for r in day_rows if r[3]]
        top_category = Counter(categories).most_common(1)[0][0] if categories else None

        summary_payload = {
            "schema_version": "0.1",
            "summary": True,
            "date": day,
            "report_count": count,
            "avg_finding_count": round(avg_findings, 2),
            "most_common_finding_category": top_category,
        }

        conn.execute(
            "INSERT INTO reports "
            "(timestamp, mode, wan_interface, finding_count, "
            " top_finding_category, top_finding_confidence, report_json, is_summary) "
            "VALUES (?, 'summary', '', ?, ?, NULL, ?, 1)",
            (day_start, count, top_category, json.dumps(summary_payload)),
        )
        ids_to_delete.extend(r[0] for r in day_rows)

    if ids_to_delete:
        placeholders = ",".join("?" for _ in ids_to_delete)
        conn.execute(f"DELETE FROM reports WHERE id IN ({placeholders})", ids_to_delete)
        conn.commit()

    return len(ids_to_delete)


def _delete_old_summaries(conn: sqlite3.Connection, cutoff_iso: str) -> int:
    cur = conn.execute(
        "DELETE FROM reports WHERE is_summary = 1 AND timestamp < ?",
        (cutoff_iso,),
    )
    conn.commit()
    return cur.rowcount


def _enforce_max_count(conn: sqlite3.Connection, max_count: int) -> int:
    """Delete oldest full (non-summary) reports beyond *max_count*."""
    if not max_count or max_count <= 0:
        return 0
    total = conn.execute("SELECT COUNT(*) FROM reports WHERE is_summary = 0").fetchone()[0]
    if total <= max_count:
        return 0
    excess = total - max_count
    cur = conn.execute(
        "DELETE FROM reports WHERE id IN ("
        "  SELECT id FROM reports WHERE is_summary = 0 ORDER BY timestamp ASC LIMIT ?"
        ")",
        (excess,),
    )
    conn.commit()
    return cur.rowcount


def _enforce_max_size(conn: sqlite3.Connection, db_path: str | Path, max_mb: int) -> int:
    """Delete oldest full reports in batches until under *max_mb*, or until
    only MIN_REPORTS_KEPT full reports remain (never deletes below that floor)."""
    if not max_mb or max_mb <= 0:
        return 0
    max_bytes = max_mb * 1024 * 1024
    deleted = 0
    db_path = Path(db_path)

    while db_path.exists() and db_path.stat().st_size > max_bytes:
        remaining = conn.execute("SELECT COUNT(*) FROM reports WHERE is_summary = 0").fetchone()[0]
        if remaining <= MIN_REPORTS_KEPT:
            break
        cur = conn.execute(
            "DELETE FROM reports WHERE id IN ("
            "  SELECT id FROM reports WHERE is_summary = 0 "
            "  ORDER BY timestamp ASC LIMIT ?"
            ")",
            (MAINTENANCE_BATCH_SIZE,),
        )
        conn.commit()
        deleted += cur.rowcount
        if cur.rowcount == 0:
            break

    return deleted


def apply_retention(conn: sqlite3.Connection, db_path: str | Path, config=None) -> dict:
    """Apply the full retention policy and return a maintenance event summary.

    Tiering:
    1. Full reports older than config.full_report_days are aggregated into
       one daily-summary row per day, then the originals are deleted.
    2. Summary rows older than config.daily_summary_days are deleted outright.
    3. If more than config.max_report_count full reports remain, the oldest
       are deleted down to that limit.
    4. If the database file still exceeds config.max_database_mb, the oldest
       full reports are deleted in batches (never below MIN_REPORTS_KEPT).
    5. VACUUM runs if free-page fragmentation exceeds the configured threshold.

    Only the writer process (probe.cli) should call this — it requires
    write access to the database, unlike probe.api which only ever opens
    the store read-only.
    """
    from .config import RetentionConfig

    if not isinstance(config, RetentionConfig):
        config = RetentionConfig()

    now = datetime.now(timezone.utc)
    cutoff_full = (now - timedelta(days=config.full_report_days)).isoformat()
    cutoff_summary = (now - timedelta(days=config.daily_summary_days)).isoformat()

    bytes_before = Path(db_path).stat().st_size if Path(db_path).exists() else 0

    records_deleted = 0
    records_deleted += _summarize_old_reports(conn, cutoff_full)
    records_deleted += _delete_old_summaries(conn, cutoff_summary)
    records_deleted += _enforce_max_count(conn, config.max_report_count)
    records_deleted += _enforce_max_size(conn, db_path, config.max_database_mb)

    # Compact if fragmentation threshold exceeded
    page_count = conn.execute("PRAGMA page_count").fetchone()[0]
    free_pages = conn.execute("PRAGMA freelist_count").fetchone()[0]
    if free_pages > 0 and page_count > 0:
        frag_percent = (free_pages / page_count) * 100
        if frag_percent > config.vacuum_threshold_percent:
            try:
                conn.execute("VACUUM")
                conn.commit()
            except sqlite3.OperationalError:
                pass

    bytes_after = Path(db_path).stat().st_size if Path(db_path).exists() else 0
    bytes_reclaimed = max(0, bytes_before - bytes_after)

    event = {
        "timestamp": now.isoformat(),
        "event_type": "retention_cleanup",
        "records_deleted": records_deleted,
        "bytes_reclaimed": bytes_reclaimed,
        "details": f"Deleted/summarized {records_deleted} old rows, reclaimed {bytes_reclaimed} bytes",
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
