"""Tests for the append-only controller audit store."""

from __future__ import annotations

import json
import sqlite3

import pytest

from probe.controller_state import ControllerState, transition
from probe.controller_store import ControlEvent, ControllerStore


def _make_transition():
    return transition(ControllerState.OBSERVING, ControllerState.PROPOSAL_READY, "test_reason")


def test_initialize_creates_table(tmp_path):
    store = ControllerStore(tmp_path / "ctrl.db")
    store.initialize()
    conn = sqlite3.connect(str(tmp_path / "ctrl.db"))
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='control_events'").fetchall()
    assert len(rows) == 1
    conn.close()


def test_append_round_trip(tmp_path):
    store = ControllerStore(tmp_path / "ctrl.db")
    store.initialize()
    event = ControlEvent(
        interface_name="eth0",
        ifindex=2,
        transition=_make_transition(),
        reason_code="test_reason",
        proposal={"schema_version": 1, "recommendation_mbit": 50.0},
    )
    event_id = store.append(event)
    assert event_id

    conn = sqlite3.connect(str(tmp_path / "ctrl.db"))
    row = conn.execute("SELECT * FROM control_events WHERE event_id=?", (event_id,)).fetchone()
    assert row is not None
    conn.close()


def test_append_records_correct_fields(tmp_path):
    store = ControllerStore(tmp_path / "ctrl.db")
    store.initialize()
    event = ControlEvent(
        interface_name="wan",
        ifindex=3,
        transition=_make_transition(),
        reason_code="estimate_ready",
        proposal={"schema_version": 1},
    )
    event_id = store.append(event)

    conn = sqlite3.connect(str(tmp_path / "ctrl.db"))
    row = conn.execute(
        "SELECT interface_name, ifindex, state_from, state_to, applied, confirmed, rollback_triggered FROM control_events WHERE event_id=?",
        (event_id,),
    ).fetchone()
    assert row[0] == "wan"
    assert row[1] == 3
    assert row[2] == "observing"
    assert row[3] == "proposal_ready"
    assert row[4] == 0   # applied
    assert row[5] == 0   # confirmed
    assert row[6] == 0   # rollback_triggered
    conn.close()


def test_oversize_proposal_raises(tmp_path):
    store = ControllerStore(tmp_path / "ctrl.db")
    store.initialize()
    event = ControlEvent(
        interface_name="eth0",
        ifindex=2,
        transition=_make_transition(),
        reason_code="test",
        proposal={"data": "x" * (65 * 1024)},
    )
    with pytest.raises(ValueError, match="64 KiB"):
        store.append(event)


def test_proposal_sha256_is_stored(tmp_path):
    import hashlib
    store = ControllerStore(tmp_path / "ctrl.db")
    store.initialize()
    proposal = {"schema_version": 1}
    event = ControlEvent(
        interface_name="eth0",
        ifindex=2,
        transition=_make_transition(),
        reason_code="test",
        proposal=proposal,
    )
    event_id = store.append(event)

    expected_json = json.dumps(proposal, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    expected_digest = hashlib.sha256(expected_json.encode("utf-8")).hexdigest()

    conn = sqlite3.connect(str(tmp_path / "ctrl.db"))
    row = conn.execute("SELECT proposal_sha256 FROM control_events WHERE event_id=?", (event_id,)).fetchone()
    assert row[0] == expected_digest
    conn.close()
