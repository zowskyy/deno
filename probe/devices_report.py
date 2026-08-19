"""Assembles the device inventory + baseline diff into one report, with a
plain-language summary line meant to be read by a non-technical person.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from .device_history import diff_and_save, list_recent_events, open_device_store
from .devices import build_device_inventory

SCHEMA_VERSION = "0.1"


def _vendor_breakdown(devices: list[dict]) -> str:
    vendors = [d["vendor"] for d in devices if d.get("vendor")]
    if not vendors:
        return ""
    counts = Counter(vendors)
    parts = [f"{n} {v}" for v, n in counts.most_common()]
    return ", ".join(parts)


def _plain_summary(inventory: dict, diff: dict | None) -> str:
    if inventory["source"] == "unavailable":
        return (
            "Couldn't check your network devices from here — this needs to run "
            "on the router itself (or a device with access to its neighbor table)."
        )

    count = inventory["device_count"]
    if count == 0:
        return "No devices found on your network right now."

    counts = inventory["counts"]
    known = counts["known_vendor"]
    private = counts["randomized_private"]
    unknown = counts["unknown_vendor"]

    pieces = [f"You have {count} device{'s' if count != 1 else ''} connected"]

    detail_bits = []
    vendor_str = _vendor_breakdown(inventory["devices"])
    if vendor_str:
        detail_bits.append(vendor_str)
    if private:
        detail_bits.append(f"{private} private/randomized")
    if unknown:
        detail_bits.append(f"{unknown} unknown vendor")
    if detail_bits:
        pieces[0] += ": " + ", ".join(detail_bits)
    pieces[0] += "."

    if diff is not None:
        if diff["is_first_scan"]:
            pieces.append("This is your first scan — nothing to compare against yet.")
        else:
            if diff["new_devices"]:
                n = len(diff["new_devices"])
                pieces.append(f"{n} device{'s' if n != 1 else ''} new since last scan.")
            if diff["missing_devices"]:
                m = len(diff["missing_devices"])
                verb = "hasn't" if m == 1 else "haven't"
                pieces.append(f"{m} device{'s' if m != 1 else ''} {verb} been seen since last scan.")
            if not diff["new_devices"] and not diff["missing_devices"]:
                pieces.append("Nothing new since last scan.")

    return " ".join(pieces)


def build_device_report(db_path: str | None = None) -> dict:
    """Build a full device report: current inventory, optional baseline
    diff (new-vs-known devices) if *db_path* is given, and a plain-language
    summary line.
    """
    inventory = build_device_inventory()
    timestamp = datetime.now(timezone.utc).isoformat()

    diff = None
    if db_path is not None:
        conn = open_device_store(db_path)
        try:
            diff = diff_and_save(conn, inventory["devices"], timestamp)
        finally:
            conn.close()

    report = {
        "schema_version": SCHEMA_VERSION,
        "timestamp": timestamp,
        "source": inventory["source"],
        "device_count": inventory["device_count"],
        "counts": inventory["counts"],
        "devices": inventory["devices"],
        "new_device_count": len(diff["new_devices"]) if diff else None,
        "new_devices": diff["new_devices"] if diff else None,
        "missing_device_count": len(diff["missing_devices"]) if diff else None,
        "missing_devices": diff["missing_devices"] if diff else None,
        "is_first_scan": diff["is_first_scan"] if diff else None,
        "events_this_scan": diff["events"] if diff else None,
        "summary": "",
    }
    report["summary"] = _plain_summary(inventory, diff)
    return report


def get_recent_activity(db_path: str, limit: int = 50) -> list[dict]:
    """Return the recent device-activity timeline without running a new
    scan — for viewing history (e.g. in the dashboard) independent of
    triggering a fresh probe.
    """
    conn = open_device_store(db_path)
    try:
        return list_recent_events(conn, limit=limit)
    finally:
        conn.close()
