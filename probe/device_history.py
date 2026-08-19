"""SQLite-backed device baseline — tracks which MACs have been seen before,
so a new scan can honestly say "this one's new" vs "seen before."

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
    last_ip TEXT
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
    against the stored baseline, update the baseline, and return which
    MACs are new vs already-known.

    A MAC counts as "new" only if the baseline already had at least one
    prior scan — an empty baseline means this is the first-ever scan, and
    everything in it is the starting point, not a surprise. This avoids
    the false alarm of "47 new devices!" on the very first run.
    """
    cur = conn.execute("SELECT COUNT(*) FROM devices")
    is_first_scan = cur.fetchone()[0] == 0

    existing_macs = {row[0] for row in conn.execute("SELECT mac FROM devices").fetchall()}

    new_devices = []
    known_devices = []

    for d in classified_devices:
        mac = d["mac"]
        if mac in existing_macs:
            known_devices.append(d)
            conn.execute(
                "UPDATE devices SET last_seen = ?, last_ip = ?, vendor = ?, type = ? WHERE mac = ?",
                (timestamp, d.get("ip"), d.get("vendor"), d["type"], mac),
            )
        else:
            if not is_first_scan:
                new_devices.append(d)
            else:
                known_devices.append(d)
            conn.execute(
                "INSERT INTO devices (mac, vendor, type, first_seen, last_seen, last_ip) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (mac, d.get("vendor"), d["type"], timestamp, timestamp, d.get("ip")),
            )

    conn.commit()

    return {
        "is_first_scan": is_first_scan,
        "new_devices": new_devices,
        "known_devices": known_devices,
    }


def list_known_devices(conn: sqlite3.Connection) -> list[dict]:
    """Return every device ever seen, most-recently-seen first."""
    cur = conn.execute(
        "SELECT mac, vendor, type, first_seen, last_seen, last_ip "
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
        }
        for row in cur.fetchall()
    ]
