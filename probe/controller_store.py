"""Append-only SQLite audit log for controller state transitions.

Every observed state transition (including blocked observe-only
decisions) is recorded here before any future actuation could occur.
This module has no knowledge of actuation — it just durably records
what the controller decided and why.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from .controller_state import StateTransition

_MAX_PROPOSAL_BYTES = 64 * 1024

_SCHEMA = """
CREATE TABLE IF NOT EXISTS control_events (
    event_id TEXT PRIMARY KEY,
    created_at_wall_ns INTEGER NOT NULL,
    created_at_mono_ns INTEGER NOT NULL,
    interface_name TEXT NOT NULL,
    ifindex INTEGER NOT NULL CHECK (ifindex > 0),
    state_from TEXT NOT NULL,
    state_to TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    proposal_json TEXT NOT NULL,
    proposal_sha256 TEXT NOT NULL,
    applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
    confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
    rollback_triggered INTEGER NOT NULL DEFAULT 0 CHECK (rollback_triggered IN (0, 1))
);
"""


@dataclass(frozen=True)
class ControlEvent:
    interface_name: str
    ifindex: int
    transition: StateTransition
    reason_code: str
    proposal: dict


class ControllerStore:
    def __init__(self, path: str | Path) -> None:
        self._path = str(path)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 1500")
        conn.execute("PRAGMA journal_mode = DELETE")
        conn.execute("PRAGMA synchronous = FULL")
        try:
            conn.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, 65536)
            conn.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 1048576)
        except AttributeError:
            pass
        return conn

    def initialize(self) -> None:
        conn = self._connect()
        try:
            conn.execute(_SCHEMA)
            conn.commit()
        finally:
            conn.close()

    def append(self, event: ControlEvent) -> str:
        if not event.interface_name:
            raise ValueError("interface_name must be non-empty")
        if event.ifindex <= 0:
            raise ValueError("ifindex must be > 0")

        proposal_json = json.dumps(
            event.proposal, ensure_ascii=True, separators=(",", ":"), sort_keys=True
        )
        proposal_bytes = proposal_json.encode("utf-8")
        if len(proposal_bytes) > _MAX_PROPOSAL_BYTES:
            raise ValueError(f"proposal exceeds 64 KiB limit ({len(proposal_bytes)} bytes)")
        proposal_sha256 = hashlib.sha256(proposal_bytes).hexdigest()

        event_id = str(uuid.uuid4())
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO control_events (
                    event_id, created_at_wall_ns, created_at_mono_ns,
                    interface_name, ifindex, state_from, state_to,
                    reason_code, proposal_json, proposal_sha256
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    time.time_ns(),
                    time.monotonic_ns(),
                    event.interface_name,
                    event.ifindex,
                    str(event.transition.previous),
                    str(event.transition.current),
                    event.reason_code,
                    proposal_json,
                    proposal_sha256,
                ),
            )
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            raise
        finally:
            conn.close()

        return event_id
