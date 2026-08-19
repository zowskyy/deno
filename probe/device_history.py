"""SQLite-backed device baseline — tracks which MACs have been seen before,
so a new scan can honestly say "this one's new" vs "seen before," and
records a timeline of presence changes (joined, went quiet, came back) so
checking in later shows what happened, not just the current snapshot.

Separate database file from the gateway-probe report store (probe.store)
on purpose: device history and gateway health reports are different data
with different lifecycles, and keeping them apart means one feature can
never accidentally corrupt or block the other.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
    mac TEXT PRIMARY KEY,
    vendor TEXT,
    type TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    last_ip TEXT,
    present INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS device_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    mac TEXT NOT NULL,
    vendor TEXT,
    type TEXT,
    event_type TEXT NOT NULL
);
"""


def open_device_store(db_path: str | Path) -> sqlite3.Connection:
    """Open (creating if needed) the device-baseline database at *db_path*."""
    conn = sqlite3.connect(str(db_path))
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def diff_and_save(conn: sqlite3.Connection, classified_devices: list[dict], timestamp: str) -> dict:
    """Compare *classified_devices* (from devices.build_device_inventory)
    against the stored baseline, update the baseline, and return what
    changed.

    Two distinct signals, kept deliberately separate:

    - new_devices / known_devices / is_first_scan: whether a MAC has EVER
      been seen before, at all. A MAC counts as "new" only if the baseline
      already had at least one prior scan (an empty baseline means this is
      the first-ever scan, and everything in it is the starting point, not
      a surprise — avoids "47 new devices!" on the very first run). This is
      what drives the plain-language summary line, and its meaning is
      intentionally stable: a laptop that goes to sleep and wakes up is
      never re-flagged here, to keep that line low-noise.

    - events / missing_devices: a timeline of presence *transitions* —
      device_new (brand new hardware), device_returned (known hardware
      that had gone quiet and just reappeared), device_missing (known
      hardware that was present last scan and isn't this time). Each
      transition is recorded exactly once, not on every scan a device
      stays missing, so this stays a log of *changes*, not a repeating
      alarm.
    """
    # Dedupe by MAC before touching the database: a device with two ARP
    # entries (e.g. momentarily present on two interfaces) must not be
    # processed twice in one call — that would double-INSERT into the
    # mac PRIMARY KEY (crashing with sqlite3.IntegrityError) for a brand
    # new device, or double-log a device_returned event for one that was
    # missing. First occurrence wins.
    deduped: dict[str, dict] = {}
    for d in classified_devices:
        deduped.setdefault(d["mac"], d)
    classified_devices = list(deduped.values())

    existing_rows = {row[0]: row[1] for row in conn.execute("SELECT mac, present FROM devices").fetchall()}
    is_first_scan = len(existing_rows) == 0
    current_macs = {d["mac"] for d in classified_devices}

    new_devices = []
    known_devices = []
    events = []

    for d in classified_devices:
        mac = d["mac"]
        if mac not in existing_rows:
            if not is_first_scan:
                new_devices.append(d)
                events.append({"mac": mac, "vendor": d.get("vendor"), "type": d["type"], "event_type": "device_new"})
            else:
                known_devices.append(d)
            conn.execute(
                "INSERT INTO devices (mac, vendor, type, first_seen, last_seen, last_ip, present) "
                "VALUES (?, ?, ?, ?, ?, ?, 1)",
                (mac, d.get("vendor"), d["type"], timestamp, timestamp, d.get("ip")),
            )
            existing_rows[mac] = 1
        else:
            known_devices.append(d)
            was_present = existing_rows[mac] == 1
            if not was_present:
                events.append(
                    {"mac": mac, "vendor": d.get("vendor"), "type": d["type"], "event_type": "device_returned"}
                )
            conn.execute(
                "UPDATE devices SET last_seen = ?, last_ip = ?, vendor = ?, type = ?, present = 1 "
                "WHERE mac = ?",
                (timestamp, d.get("ip"), d.get("vendor"), d["type"], mac),
            )
            existing_rows[mac] = 1

    missing_macs = [mac for mac, present in existing_rows.items() if present == 1 and mac not in current_macs]
    for mac in missing_macs:
        row = conn.execute("SELECT vendor, type FROM devices WHERE mac = ?", (mac,)).fetchone()
        events.append({
            "mac": mac,
            "vendor": row[0] if row else None,
            "type": row[1] if row else None,
            "event_type": "device_missing",
        })
        conn.execute("UPDATE devices SET present = 0 WHERE mac = ?", (mac,))

    for e in events:
        conn.execute(
            "INSERT INTO device_events (timestamp, mac, vendor, type, event_type) VALUES (?, ?, ?, ?, ?)",
            (timestamp, e["mac"], e.get("vendor"), e.get("type"), e["event_type"]),
        )

    conn.commit()

    return {
        "is_first_scan": is_first_scan,
        "new_devices": new_devices,
        "known_devices": known_devices,
        "missing_devices": missing_macs,
        "events": events,
    }


def list_known_devices(conn: sqlite3.Connection) -> list[dict]:
    """Return every device ever seen, most-recently-seen first."""
    cur = conn.execute(
        "SELECT mac, vendor, type, first_seen, last_seen, last_ip, present "
        "FROM devices ORDER BY last_seen DESC"
    )
    return [
        {
            "mac": row[0],
            "vendor": row[1],
            "type": row[2],
            "first_seen": row[3],
            "last_seen": row[4],
            "last_ip": row[5],
            "present": bool(row[6]),
        }
        for row in cur.fetchall()
    ]


def list_recent_events(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    """Return the *limit* most recent presence-change events, newest first."""
    cur = conn.execute(
        "SELECT timestamp, mac, vendor, type, event_type FROM device_events "
        "ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    return [
        {"timestamp": row[0], "mac": row[1], "vendor": row[2], "type": row[3], "event_type": row[4]}
        for row in cur.fetchall()
    ]
