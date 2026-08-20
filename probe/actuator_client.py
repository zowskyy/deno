"""Privileged actuator: applies a validated, stored proposal to a CAKE qdisc.

This is the only gateway-probe process meant to run with CAP_NET_ADMIN.
It never trusts anything it did not itself independently validate — it
re-reads and re-checks a proposal already written by the controller
(see probe/controller_store.py) rather than accepting one as a direct
call argument, per docs/architecture/actuation-design.md's proposal
handoff contract. It never constructs a shell command; every `tc`
invocation is a fixed argument list built from already-validated values.

v1 scope: egress (upload) bandwidth and RTT target only, on a
controller-owned `cake` qdisc. Ingress/download shaping (which on Linux
requires an IFB redirect) and the `gp` qdisc kind (not implemented —
see kqdisc/README.md gate B0) are both out of scope and rejected by
validate_proposal.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .controller_store import ControllerStore, PendingProposal
from .qdisc_fingerprint import QdiscFingerprint
from .safety import ApplyResult, RollbackController
from .shell import run_command as _run

_CAP_NET_ADMIN_BIT = 12
_PROC_STATUS_PATH = "/proc/self/status"

_SUPPORTED_SCHEMA_VERSION = 1
# gp is a reserved future value in the proposal schema but has no
# implementation yet (kqdisc gate B0 has not passed) — never applied.
_APPLICABLE_QDISC_KINDS = ("cake",)

_MAX_TC_OUTPUT_BYTES = 64 * 1024

_ReasonCode = Literal[
    "unknown_schema_version",
    "unsupported_qdisc_kind",
    "interface_ifindex_mismatch",
    "fingerprint_mismatch",
    "unresolved_pending_change",
    "bandwidth_out_of_range",
    "rtt_out_of_range",
    "proposal_expired",
]


class ProposalValidationError(Exception):
    def __init__(self, reason: _ReasonCode, detail: str = "") -> None:
        super().__init__(f"{reason}: {detail}" if detail else reason)
        self.reason = reason


@dataclass(frozen=True)
class ActuatorConfig:
    min_bandwidth_mbit: float = 1.0
    max_bandwidth_mbit: float = 10_000.0
    min_rtt_ms: int = 1
    max_rtt_ms: int = 1000
    allowed_schema_version: int = _SUPPORTED_SCHEMA_VERSION

    def __post_init__(self) -> None:
        if self.min_bandwidth_mbit >= self.max_bandwidth_mbit:
            raise ValueError("min_bandwidth_mbit must be < max_bandwidth_mbit")
        if self.min_rtt_ms >= self.max_rtt_ms:
            raise ValueError("min_rtt_ms must be < max_rtt_ms")


def _read_cap_effective_mask() -> int:
    with open(_PROC_STATUS_PATH, encoding="ascii") as f:
        for line in f:
            if line.startswith("CapEff:"):
                return int(line.split(":", 1)[1].strip(), 16)
    return 0


def _has_cap_net_admin() -> bool:
    try:
        mask = _read_cap_effective_mask()
    except (OSError, ValueError):
        return False
    return bool(mask & (1 << _CAP_NET_ADMIN_BIT))


def require_cap_net_admin() -> None:
    """Refuse to proceed unless this process actually holds CAP_NET_ADMIN.

    The inverse of probe/controller_daemon.py's refusal check — the
    controller must never hold this capability, and the actuator must
    always hold it, so the two checks intentionally do not share code:
    each module enforces its own side of the privilege boundary
    independently.
    """
    if not _has_cap_net_admin():
        raise RuntimeError(
            "actuator requires CAP_NET_ADMIN to apply qdisc changes; "
            "refusing to run without it rather than fail at the tc call"
        )


def validate_proposal(
    proposal: dict,
    *,
    expected_ifindex: int,
    current_fingerprint: QdiscFingerprint | None,
    expected_fingerprint_hash: str,
    now_monotonic_ns: int,
    config: ActuatorConfig,
    has_unresolved_pending: bool,
) -> None:
    """Raise ProposalValidationError on the first failed check; else return.

    Every check here is independent of whatever the controller already
    checked — a stored proposal is untrusted input from the actuator's
    point of view, per the actuation design's handoff contract.
    """
    if proposal.get("schema_version") != config.allowed_schema_version:
        raise ProposalValidationError(
            "unknown_schema_version", str(proposal.get("schema_version"))
        )

    qdisc_kind = proposal.get("qdisc_kind")
    if qdisc_kind not in _APPLICABLE_QDISC_KINDS:
        raise ProposalValidationError("unsupported_qdisc_kind", str(qdisc_kind))

    if has_unresolved_pending:
        raise ProposalValidationError("unresolved_pending_change")

    if current_fingerprint is None:
        raise ProposalValidationError("fingerprint_mismatch", "interface or qdisc could not be re-read")

    if current_fingerprint.ifindex != expected_ifindex:
        raise ProposalValidationError(
            "interface_ifindex_mismatch",
            f"expected {expected_ifindex}, got {current_fingerprint.ifindex}",
        )

    if current_fingerprint.normalized_hash() != expected_fingerprint_hash:
        raise ProposalValidationError("fingerprint_mismatch")

    requested = proposal.get("requested", {})
    bandwidth_mbit = requested.get("bandwidth_upload_mbit")
    if (
        not isinstance(bandwidth_mbit, (int, float))
        or not (config.min_bandwidth_mbit <= bandwidth_mbit <= config.max_bandwidth_mbit)
    ):
        raise ProposalValidationError("bandwidth_out_of_range", str(bandwidth_mbit))

    rtt_ms = requested.get("rtt_ms")
    if not isinstance(rtt_ms, (int, float)) or not (config.min_rtt_ms <= rtt_ms <= config.max_rtt_ms):
        raise ProposalValidationError("rtt_out_of_range", str(rtt_ms))

    expires_at = proposal.get("expires_at_monotonic_ns")
    if not isinstance(expires_at, int) or expires_at <= now_monotonic_ns:
        raise ProposalValidationError("proposal_expired", str(expires_at))


def build_tc_change_command(interface: str, bandwidth_mbit: float, rtt_ms: int) -> list[str]:
    """Fixed argument array for the one tc mutation this module ever issues.

    No shell, no string interpolation of unvalidated input — every value
    here has already passed validate_proposal's range checks.
    """
    return [
        "tc", "qdisc", "change", "dev", interface, "root", "cake",
        "bandwidth", f"{bandwidth_mbit:g}mbit",
        "rtt", f"{int(rtt_ms)}ms",
    ]


def _bounded_output(text: str, limit: int = _MAX_TC_OUTPUT_BYTES) -> str:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= limit:
        return text
    return encoded[:limit].decode("utf-8", errors="ignore") + "...<truncated>"


def read_current_fingerprint(interface: str, *, run=_run) -> QdiscFingerprint | None:
    """Read the interface's current root qdisc via the tc JSON fallback.

    Bounded, best-effort: returns None on any failure rather than raising
    — the caller (validate_proposal) treats a missing fingerprint as a
    mismatch, never as "assume it's fine."
    """
    rc, stdout, _stderr = run(["ip", "-j", "link", "show", "dev", interface])
    if rc != 0 or not stdout:
        return None
    try:
        link_info = json.loads(_bounded_output(stdout))
        ifindex = int(link_info[0]["ifindex"])
    except (ValueError, KeyError, IndexError, TypeError):
        return None

    rc, stdout, _stderr = run(["tc", "-j", "qdisc", "show", "dev", interface])
    if rc != 0 or not stdout:
        return None
    try:
        qdiscs = json.loads(_bounded_output(stdout))
        root = next((q for q in qdiscs if q.get("parent") == "root" or q.get("root")), qdiscs[0])
        kind = root["kind"]
        handle = root.get("handle", "")
        parent = "root" if root.get("root") or root.get("parent") == "root" else root.get("parent", "")
        options = root.get("options", {})
    except (ValueError, KeyError, IndexError, TypeError, StopIteration):
        return None

    return QdiscFingerprint(
        interface_name=interface,
        ifindex=ifindex,
        kind=kind,
        handle=handle,
        parent=parent,
        options=options if isinstance(options, dict) else {},
    )


@dataclass(frozen=True)
class CakeParams:
    bandwidth_mbit: float
    rtt_ms: int


def make_save_cake_fn(interface: str, *, run=_run):
    """Return a save_config_fn snapshotting the interface's current cake params.

    Compatible with probe.safety.RollbackController's Callable[[Path], bool]
    contract — the same verified-snapshot-before-apply pattern used for
    SQM config is reused here for CAKE tc parameters instead of reinventing it.
    """

    def _save(path: Path) -> bool:
        fingerprint = read_current_fingerprint(interface, run=run)
        if fingerprint is None or fingerprint.kind != "cake":
            return False
        bandwidth = fingerprint.options.get("bandwidth")
        rtt = fingerprint.options.get("rtt")
        bandwidth_mbit = _parse_rate_mbit(bandwidth)
        rtt_ms = _parse_time_ms(rtt)
        if bandwidth_mbit is None or rtt_ms is None:
            return False
        path.write_text(
            json.dumps({"bandwidth_mbit": bandwidth_mbit, "rtt_ms": rtt_ms}),
            encoding="utf-8",
        )
        return True

    return _save


def make_apply_cake_fn(interface: str, *, run=_run):
    """Return an apply_config_fn issuing the fixed tc change for a saved snapshot.

    Compatible with probe.safety.RollbackController's
    Callable[[Path], ApplyResult] contract.
    """

    def _apply(path: Path) -> ApplyResult:
        if not path.exists():
            return ApplyResult(success=False, disk_committed=False, reason=f"config file not found: {path}")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            params = CakeParams(bandwidth_mbit=float(data["bandwidth_mbit"]), rtt_ms=int(data["rtt_ms"]))
        except (ValueError, KeyError, TypeError) as exc:
            return ApplyResult(success=False, disk_committed=False, reason=f"malformed snapshot: {exc}")

        command = build_tc_change_command(interface, params.bandwidth_mbit, params.rtt_ms)
        rc, _stdout, stderr = run(command)
        if rc != 0:
            return ApplyResult(success=False, disk_committed=False, reason=f"tc qdisc change failed: {_bounded_output(stderr or str(rc))}")
        return ApplyResult(success=True, disk_committed=True)

    return _apply


_RATE_RE = re.compile(r"^([\d.]+)(k|m|g)?bit$", re.IGNORECASE)
_TIME_RE = re.compile(r"^([\d.]+)(us|ms|s)$", re.IGNORECASE)


def _parse_rate_mbit(value) -> float | None:
    if not isinstance(value, str):
        return None
    m = _RATE_RE.match(value.strip())
    if not m:
        return None
    number = float(m.group(1))
    unit = (m.group(2) or "").lower()
    scale = {"": 1e-6, "k": 1e-3, "m": 1.0, "g": 1e3}[unit]
    return number * scale


def _parse_time_ms(value) -> int | None:
    if not isinstance(value, str):
        return None
    m = _TIME_RE.match(value.strip())
    if not m:
        return None
    number = float(m.group(1))
    unit = m.group(2).lower()
    scale = {"us": 1e-3, "ms": 1.0, "s": 1e3}[unit]
    return round(number * scale)


def apply_pending_proposal(
    interface: str,
    store: ControllerStore,
    *,
    expected_ifindex: int,
    expected_fingerprint_hash: str,
    now_monotonic_ns: int,
    old_snapshot_path: Path,
    new_snapshot_path: Path,
    gateway: str,
    target: str,
    config: ActuatorConfig | None = None,
    run=_run,
) -> str:
    """Validate, then apply-with-rollback, the newest pending proposal for *interface*.

    Requires CAP_NET_ADMIN (see require_cap_net_admin). The proposal must
    already be persisted via ControllerStore.append() by the controller —
    this function only ever reads from the store, never accepts a
    proposal as a direct argument. Returns a human-readable outcome
    string; marks the store row applied/confirmed/rollback_triggered as
    appropriate for every terminal outcome.
    """
    require_cap_net_admin()
    if config is None:
        config = ActuatorConfig()

    pending: PendingProposal | None = store.get_pending_proposal(interface)
    if pending is None:
        return "no pending proposal"

    has_unresolved = store.has_unresolved_pending(interface)
    current_fingerprint = read_current_fingerprint(interface, run=run)

    try:
        validate_proposal(
            pending.proposal,
            expected_ifindex=expected_ifindex,
            current_fingerprint=current_fingerprint,
            expected_fingerprint_hash=expected_fingerprint_hash,
            now_monotonic_ns=now_monotonic_ns,
            config=config,
            has_unresolved_pending=has_unresolved,
        )
    except ProposalValidationError as exc:
        return f"rejected: {exc.reason}"

    requested = pending.proposal["requested"]
    new_snapshot_path.write_text(
        json.dumps(
            {
                "bandwidth_mbit": float(requested["bandwidth_upload_mbit"]),
                "rtt_ms": int(requested["rtt_ms"]),
            }
        ),
        encoding="utf-8",
    )

    from . import safety as _safety_mod

    controller = RollbackController(
        old_config_path=old_snapshot_path,
        new_config_path=new_snapshot_path,
        gateway=gateway,
        target=target,
        save_config_fn=make_save_cake_fn(interface, run=run),
        apply_config_fn=make_apply_cake_fn(interface, run=run),
        gateway_reachable_fn=_safety_mod.gateway_reachable,
        public_reachable_fn=_safety_mod.public_path_reachable,
    )

    outcome = controller.apply_with_rollback()

    # applied=1 is set only once tc has actually been observed to succeed
    # at least once (disk_committed) — never before the call, and never
    # for an outcome where nothing was ever changed on the router.
    if outcome == "awaiting confirmation":
        store.mark_applied(pending.event_id)
        controller.confirm()
        store.mark_confirmed(pending.event_id)
        return "confirmed: proposal applied"

    if outcome.startswith("rollback:") or outcome.startswith("ROLLBACK FAILED"):
        store.mark_applied(pending.event_id)
        store.mark_rollback_triggered(pending.event_id)
        return outcome

    # save_config_fn or apply_config_fn refused outright before ever
    # touching the router (e.g. current config unreadable) — nothing was
    # applied, so the store row stays untouched rather than claiming an
    # actuation that never happened.
    return outcome