# Track A Actuation Design

**Status: approved and implemented.** `probe/actuator_client.py` exists per
this design — see "Implementation notes" at the end for what shipped and
where it stayed strictly scoped down from the design below. The
observe-only modules (`probe/rate_estimator.py`, `probe/controller_state.py`
[observe-only subset], `probe/controller_policy.py`, `probe/controller_store.py`
[audit-append path], `probe/qdisc_fingerprint.py`, `probe/controller_daemon.py`)
still never import `probe/actuator_client.py` or touch `tc`/Netlink mutation —
enforced by `tests/test_observe_only_boundaries.py`, which also asserts the
reverse: the actuator never imports the observe-only daemon. Privilege
separation is real, not just documented: `controller_policy.evaluate()`
still only ever returns `actuation_status = "blocked"` or
`"blocked_pending_actuation_design_approval"` — the controller process
itself still never calls `tc` or the actuator directly; actuation only
happens via `probe/actuator_client.apply_pending_proposal()` reading a
persisted proposal row, run as its own privileged invocation.

## Why a separate process

The controller (no `CAP_NET_ADMIN`) must never be the process that changes a
qdisc. If it were, a bug or compromise in the rate-estimation/policy code —
which parses untrusted measurement data — would have direct write access to
network configuration. Splitting proposal (controller) from execution
(actuator) means the only code path with `CAP_NET_ADMIN` is small, has no
network-facing input, and does one job: validate a stored proposal and issue
one bounded `tc` command.

```
probe/controller_daemon.py   (no CAP_NET_ADMIN)
       ↓ writes ControlEvent via probe/controller_store.py
   control_events table (SQLite, on disk)
       ↓ read by
probe/actuator_client.py     (CAP_NET_ADMIN — separate process/invocation)
       ↓ issues one tc qdisc change via a fixed argument array
CAKE or sch_gp (kernel)
       ↑ existing probe/safety.py timed-rollback wrapper (reused, not reinvented)
```

## Actuation states (extends `probe/controller_state.py`)

The current `ControllerState` enum only models the observe-only subset
(`DISABLED`, `OBSERVE_ONLY`, `OBSERVING`, `PROPOSAL_READY`, `FROZEN`). When
actuation is approved, these states are added, with the same `_ALLOWED`
transition-guard pattern already in place:

```
PROPOSAL_READY
  → APPLYING              (actuator accepted the proposal)
  → OBSERVE_ONLY           (actuator rejected; log reason — already legal today)

APPLYING
  → PENDING_CONFIRMATION   (tc change succeeded)
  → ROLLING_BACK           (tc change failed)

PENDING_CONFIRMATION
  → CONFIRMED              (next-cycle latency did not regress)
  → ROLLING_BACK           (regression detected or confirmation window expired)
  → FROZEN                 (actuation count exceeded, or rollback itself failed)

CONFIRMED / ROLLING_BACK
  → OBSERVING              (after cooldown dwell, min 10 min configurable)

Any state → FROZEN on:
  malformed report, unsupported qdisc kind, external fingerprint change,
  controller or actuator error, excessive rollback rate, storage failure
```

`FROZEN` remains a one-way trap except for the existing
`FROZEN → OBSERVE_ONLY` operator-cleared transition — actuation does not
change that invariant.

## Proposal handoff contract

The controller never calls the actuator directly (no IPC, no shared memory,
no signal). The only channel is the `control_events` row itself:

1. Controller reaches `PROPOSAL_READY` in `controller_policy.evaluate()`.
2. Controller calls `controller_store.append()` — this **must** succeed
   before anything else happens. If the store write fails, the controller
   transitions to `FROZEN` (existing "storage failure" freeze rule) and no
   actuation is attempted.
3. The actuator (run separately, with `CAP_NET_ADMIN`, on its own schedule
   or invoked via a procd-triggered oneshot) polls `control_events` for rows
   where `state_to = 'proposal_ready'` and `applied = 0`.
4. The actuator independently re-validates the proposal (see below) — it
   never trusts that the controller's validation still holds by the time it
   reads the row.
5. The actuator sets `applied = 1` only after a `tc` invocation it directly
   observed to succeed, in the same transaction pattern as
   `controller_store.append()` (`BEGIN IMMEDIATE` / commit or rollback).

This means the two processes are only ever coupled through durable,
attributable state — the same pattern `probe/controller_store.py` already
uses for the observe-only audit trail.

## Proposal schema (persisted before actuation, already scaffolded)

```json
{
  "schema_version": 1,
  "change_id": "<uuid>",
  "interface": "wan",
  "qdisc_kind": "cake",
  "requested": {
    "bandwidth_upload_mbit": 47,
    "bandwidth_download_mbit": 92,
    "rtt_ms": 25
  },
  "reason_codes": ["RATE_ESTIMATE_CONFIDENT", "MIN_DWELL_ELAPSED"],
  "expires_at_monotonic_ns": 1234567890,
  "baseline_report_id": 42
}
```

`schema_version` is checked on read; an actuator encountering an unknown
version treats the row as unusable and does not fall back to guessing a
compatible interpretation.

## Actuator validation (all must pass before any `tc` invocation)

- `schema_version` is a known, exact match.
- Interface still exists and its `ifindex` is unchanged since the proposal
  was written (re-read via Netlink, not cached).
- Qdisc kind matches the expected value (`cake` or `gp`) — anything else is
  rejected outright, never coerced.
- Current qdisc fingerprint (`probe/qdisc_fingerprint.py`) matches the
  fingerprint recorded as controller-owned; a mismatch means something else
  changed the qdisc out-of-band and actuation is refused, not forced.
- No other row for this interface has `applied = 1` and
  `confirmed/rollback_triggered = 0` — i.e. no unresolved pending change.
  This enforces "one pending change maximum per interface" as a storage
  invariant, not just a policy check.
- Requested rate and RTT values fall inside a fixed, configured allowlist
  range (not just "positive") — the same bounds `probe/rate_estimator.py`
  already enforces via `EstimatorConfig.min_rate_mbit` /
  `max_rate_mbit`, re-checked independently here.
- `expires_at_monotonic_ns` has not passed. A stale proposal is discarded,
  not applied late.

Any validation failure is recorded back into the `control_events` row
(`rollback_triggered` semantics do not apply here — nothing was ever
applied — a distinct `applied = 0` terminal state with the rejection reason
is written) and the actuator exits without touching `tc`.

## Command construction

- The actuator never builds a shell string. It builds a fixed
  `list[str]` argument array (same pattern as `probe/shell.run_command` and
  `probe/safety.py`'s existing `_run(["uci", ...])` calls) and passes it
  directly to the subprocess call — no `shell=True`, no string
  interpolation of proposal values into a command line.
- Every value substituted into the argument array (rate, RTT, interface
  name) has already passed the allowlist/range check above; the actuator
  does not read config values it hasn't itself validated.
- `tc` stdout/stderr are captured under the same bounded-size cap used
  elsewhere in the codebase for utility output (see
  `docs/architecture/netlink-collection.md`'s bounded `tc` JSON fallback) —
  unbounded output is truncated, not trusted whole.

## Rollback reuses `probe/safety.py`, not a new mechanism

`probe/safety.py` already implements exactly the property actuation needs:
snapshot before change, apply, verify reachability, and a **verified**
restore (never "we tried") on failure or on confirmation timeout. Track A's
`APPLYING → ROLLING_BACK` and `PENDING_CONFIRMATION → ROLLING_BACK`
transitions call into this existing module rather than reimplementing
backup/restore logic:

- `APPLYING`: actuator calls `save_sqm_config()`-equivalent (or the `cake`/
  `gp`-specific analogue) before `apply_sqm_config()`-equivalent for the
  qdisc case, exactly mirroring the existing save → apply → verify flow.
- `PENDING_CONFIRMATION`: the existing confirm-timeout/rollback logic in
  `probe/safety.py` (touch a confirm file, or the controller's next
  observation cycle standing in for that signal) governs whether the change
  is confirmed or reverted — no new timing mechanism is introduced.
- A rollback that itself fails to verify is the one path that goes straight
  to `FROZEN`, per the existing "rollback failed" freeze rule — this is
  intentionally more conservative than `probe/safety.py`'s current
  behavior, because Track A also has a live controller loop that must stop
  proposing changes once its own rollback path is untrustworthy.

## Circuit breaker

Repeated regressions (more than 2 `ROLLING_BACK` outcomes within a
configurable rolling window, default 24h) transition straight to `FROZEN`
regardless of confidence or dwell state — this is the "excessive rollback
rate" freeze condition already named in the state machine above. Clearing
`FROZEN` is always an explicit operator action
(`FROZEN → OBSERVE_ONLY`, already implemented), never automatic.

## Required tests before actuation code ships

These extend the existing Track A test suite
(`tests/test_controller_state.py`, `tests/test_controller_policy.py`,
`tests/test_controller_store.py`, `tests/test_qdisc_fingerprint.py`) with
actuator-specific cases, and must all pass — plus the full existing suite
staying green — before `probe/actuator_client.py` is merged:

**Command and privilege safety**
- Actuator rejects unknown/unsupported qdisc kind
- Actuator rejects out-of-range rate and RTT even if the stored proposal
  somehow contains them (defense in depth against a corrupted or
  tampered row)
- No subprocess is ever constructed from a shell string
  (`tests/test_observe_only_boundaries.py`'s forbidden-token pattern
  extends to `probe/actuator_client.py`)
- Actuator process asserts it *does* hold `CAP_NET_ADMIN` at startup and
  refuses to run without it (inverse of
  `controller_daemon._has_cap_net_admin()`'s existing refuse-if-present
  check)
- `tc` output size cap enforced; oversized output is truncated and flagged,
  never silently accepted

**Storage and restart**
- Proposal must already be persisted (via `controller_store.append()`)
  before any `tc` call is attempted — an actuator given an unpersisted
  proposal refuses to act
- A failed audit write blocks actuation (extends the existing "storage
  failure freezes actuation" rule to the actuator's own write path)
- Restart while a row is in `applied=1, confirmed=0` (i.e. mid
  `PENDING_CONFIRMATION`) restores that pending state rather than losing
  track of an in-flight change
- Storage failure at any point in the actuation path freezes actuation and
  preserves read-only collection — actuation failure must never take down
  measurement

**Rollback correctness**
- A failed `tc` apply triggers rollback via `probe/safety.py`'s existing
  verified-restore path, and actuation only reports success if that verify
  step itself succeeded
- Rollback restores only controller-owned fields — it must not clobber
  operator-set qdisc options outside what the controller itself changed
- A rollback that fails to verify transitions to `FROZEN`, not to a
  retry loop

## Implementation notes (post-approval)

What shipped in `probe/actuator_client.py`, `probe/controller_state.py`
(actuation states), and `probe/controller_store.py` (pending-proposal
query/update methods), with `tests/test_actuator_client.py` covering the
full required test list above:

- **State machine**: `APPLYING`, `PENDING_CONFIRMATION`, `CONFIRMED`,
  `ROLLING_BACK`, `COOLDOWN` added to `ControllerState` with the exact
  transition graph specified above, plus `is_actuation_state()`.
- **Store**: `get_pending_proposal()`, `has_unresolved_pending()`, and
  `mark_applied()` / `mark_confirmed()` / `mark_rollback_triggered()`
  give the actuator its read/write surface without it ever accepting a
  proposal as a direct call argument — it only ever reads the newest
  unresolved `proposal_ready` row for an interface.
- **Validation**: `validate_proposal()` independently re-checks schema
  version, qdisc kind, ifindex (against a freshly re-read fingerprint,
  never a cached value), fingerprint match, unresolved-pending state,
  bandwidth/RTT allowlist bounds, and expiry — exactly the "actuator
  validation" list above, each as its own typed `ProposalValidationError`
  reason code with its own test.
- **Command construction**: `build_tc_change_command()` returns a fixed
  `list[str]`; no shell string is ever built, verified by both a unit
  test and the boundary-test's forbidden-token scan of the module source.
- **Rollback**: reuses `probe.safety.RollbackController` directly rather
  than reimplementing snapshot/apply/verify/restore — `make_save_cake_fn()`
  and `make_apply_cake_fn()` adapt it to CAKE tc parameters instead of
  UCI `sqm` config, matching the `Callable[[Path], bool]` /
  `Callable[[Path], ApplyResult]` contracts `RollbackController` already
  defines.
- **Deliberate v1 scope narrowing** (not a spec violation, a documented
  cut): only **egress** (`bandwidth_upload_mbit` + `rtt_ms`) is applied.
  Ingress/download shaping normally requires an IFB redirect qdisc, which
  is a separate, non-trivial mechanism this pass does not implement —
  `bandwidth_download_mbit` is still validated as part of the proposal
  schema shape but is not yet acted on. `qdisc_kind = "gp"` is explicitly
  rejected (`unsupported_qdisc_kind`) since `sch_gp` has no implementation
  until kqdisc gate B0 passes — this was already true of the schema, now
  it's enforced at the one place that could otherwise silently no-op it.
- **Privilege check inversion**: `require_cap_net_admin()` is the mirror
  of `controller_daemon._has_cap_net_admin()`'s refusal check, implemented
  independently (no shared helper) per the "each side enforces its own
  boundary" principle — verified by `tests/test_observe_only_boundaries.py`
  asserting the actuator never imports the observe-only daemon module.

Not yet wired: a procd-managed invocation path for the actuator (it is a
library today, called via `apply_pending_proposal()`, not yet its own
deployed binary/init script) and download/ingress shaping. Both are
natural next slices, each deserving their own focused review before
shipping, not bundled into this pass.
