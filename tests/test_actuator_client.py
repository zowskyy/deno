"""Tests for the privileged actuator client.

Covers the required-before-ship test list from
docs/architecture/actuation-design.md: command/privilege safety,
storage/restart invariants, and rollback correctness. All tc/CAP_NET_ADMIN
access is injected/monkeypatched — no real privileges or network access
are needed to run this file.
"""

from __future__ import annotations

import json

import pytest

from probe.actuator_client import (
    ActuatorConfig,
    ProposalValidationError,
    apply_pending_proposal,
    build_tc_change_command,
    make_apply_cake_fn,
    make_save_cake_fn,
    read_current_fingerprint,
    require_cap_net_admin,
    validate_proposal,
)
from probe.controller_state import ControllerState, transition
from probe.controller_store import ControlEvent, ControllerStore
from probe.qdisc_fingerprint import QdiscFingerprint


def _fp(**overrides):
    defaults = dict(
        interface_name="eth0",
        ifindex=2,
        kind="cake",
        handle="801:",
        parent="root",
        options={"bandwidth": "50mbit", "rtt": "25ms"},
    )
    defaults.update(overrides)
    return QdiscFingerprint(**defaults)


def _proposal(**overrides):
    base = {
        "schema_version": 1,
        "change_id": "11111111-1111-1111-1111-111111111111",
        "interface": "eth0",
        "qdisc_kind": "cake",
        "requested": {"bandwidth_upload_mbit": 47, "bandwidth_download_mbit": 92, "rtt_ms": 25},
        "reason_codes": ["RATE_ESTIMATE_CONFIDENT"],
        "expires_at_monotonic_ns": 10_000_000_000,
        "baseline_report_id": 1,
    }
    base.update(overrides)
    return base


class TestValidateProposal:
    def _call(self, **overrides):
        kwargs = dict(
            proposal=_proposal(),
            expected_ifindex=2,
            current_fingerprint=_fp(),
            expected_fingerprint_hash=_fp().normalized_hash(),
            now_monotonic_ns=0,
            config=ActuatorConfig(),
            has_unresolved_pending=False,
        )
        kwargs.update(overrides)
        validate_proposal(**kwargs)

    def test_valid_proposal_passes(self):
        self._call()

    def test_unknown_schema_version_rejected(self):
        with pytest.raises(ProposalValidationError) as exc:
            self._call(proposal=_proposal(schema_version=99))
        assert exc.value.reason == "unknown_schema_version"

    def test_unsupported_qdisc_kind_rejected(self):
        with pytest.raises(ProposalValidationError) as exc:
            self._call(proposal=_proposal(qdisc_kind="fq_codel"))
        assert exc.value.reason == "unsupported_qdisc_kind"

    def test_gp_qdisc_kind_rejected_not_yet_implemented(self):
        # gp is a reserved schema value but has no working kernel qdisc yet
        # (kqdisc gate B0 has not passed) — must never be applied.
        with pytest.raises(ProposalValidationError) as exc:
            self._call(proposal=_proposal(qdisc_kind="gp"))
        assert exc.value.reason == "unsupported_qdisc_kind"

    def test_ifindex_mismatch_rejected(self):
        with pytest.raises(ProposalValidationError) as exc:
            self._call(expected_ifindex=3)
        assert exc.value.reason == "interface_ifindex_mismatch"

    def test_fingerprint_mismatch_rejected(self):
        with pytest.raises(ProposalValidationError) as exc:
            self._call(current_fingerprint=_fp(handle="999:"))
        assert exc.value.reason == "fingerprint_mismatch"

    def test_missing_fingerprint_rejected(self):
        with pytest.raises(ProposalValidationError) as exc:
            self._call(current_fingerprint=None)
        assert exc.value.reason == "fingerprint_mismatch"

    def test_unresolved_pending_rejected(self):
        with pytest.raises(ProposalValidationError) as exc:
            self._call(has_unresolved_pending=True)
        assert exc.value.reason == "unresolved_pending_change"

    def test_bandwidth_above_range_rejected(self):
        config = ActuatorConfig(max_bandwidth_mbit=40.0)
        with pytest.raises(ProposalValidationError) as exc:
            self._call(config=config)
        assert exc.value.reason == "bandwidth_out_of_range"

    def test_bandwidth_missing_rejected(self):
        proposal = _proposal()
        del proposal["requested"]["bandwidth_upload_mbit"]
        with pytest.raises(ProposalValidationError) as exc:
            self._call(proposal=proposal)
        assert exc.value.reason == "bandwidth_out_of_range"

    def test_rtt_above_range_rejected(self):
        config = ActuatorConfig(max_rtt_ms=10)
        with pytest.raises(ProposalValidationError) as exc:
            self._call(config=config)
        assert exc.value.reason == "rtt_out_of_range"

    def test_expired_proposal_rejected(self):
        with pytest.raises(ProposalValidationError) as exc:
            self._call(now_monotonic_ns=20_000_000_000)
        assert exc.value.reason == "proposal_expired"

    def test_missing_expiry_rejected(self):
        proposal = _proposal()
        del proposal["expires_at_monotonic_ns"]
        with pytest.raises(ProposalValidationError) as exc:
            self._call(proposal=proposal)
        assert exc.value.reason == "proposal_expired"


class TestActuatorConfigValidation:
    def test_invalid_bandwidth_bounds_raise(self):
        with pytest.raises(ValueError):
            ActuatorConfig(min_bandwidth_mbit=100.0, max_bandwidth_mbit=50.0)

    def test_invalid_rtt_bounds_raise(self):
        with pytest.raises(ValueError):
            ActuatorConfig(min_rtt_ms=100, max_rtt_ms=50)


class TestCommandConstruction:
    def test_command_is_fixed_argument_list(self):
        command = build_tc_change_command("eth0", 47.5, 25)
        assert command == [
            "tc", "qdisc", "change", "dev", "eth0", "root", "cake",
            "bandwidth", "47.5mbit", "rtt", "25ms",
        ]
        assert all(isinstance(part, str) for part in command)

    def test_no_shell_metacharacters_possible_from_numeric_values(self):
        # bandwidth/rtt are numbers by the time they reach this function
        # (validate_proposal already enforced that) — confirm the builder
        # itself performs no string interpolation of untrusted text.
        command = build_tc_change_command("eth0; rm -rf /", 47.0, 25)
        assert command[4] == "eth0; rm -rf /"  # passed through as ONE argv element, never a shell string
        assert len(command) == 11


class TestCapNetAdminRequirement:
    def test_missing_cap_net_admin_raises(self, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: False)
        with pytest.raises(RuntimeError, match="CAP_NET_ADMIN"):
            require_cap_net_admin()

    def test_present_cap_net_admin_does_not_raise(self, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: True)
        require_cap_net_admin()


class TestReadCurrentFingerprint:
    def test_parses_valid_output(self):
        def fake_run(cmd, **kw):
            if cmd[0] == "ip":
                return 0, json.dumps([{"ifindex": 2}]), ""
            return 0, json.dumps([{"kind": "cake", "handle": "801:", "root": True, "options": {"bandwidth": "50mbit"}}]), ""

        fp = read_current_fingerprint("eth0", run=fake_run)
        assert fp is not None
        assert fp.ifindex == 2
        assert fp.kind == "cake"
        assert fp.options["bandwidth"] == "50mbit"

    def test_ip_failure_returns_none(self):
        def fake_run(cmd, **kw):
            return 1, "", "no such device"

        assert read_current_fingerprint("eth0", run=fake_run) is None

    def test_malformed_json_returns_none(self):
        def fake_run(cmd, **kw):
            if cmd[0] == "ip":
                return 0, "not json", ""
            return 0, "[]", ""

        assert read_current_fingerprint("eth0", run=fake_run) is None

    def test_tc_failure_returns_none(self):
        def fake_run(cmd, **kw):
            if cmd[0] == "ip":
                return 0, json.dumps([{"ifindex": 2}]), ""
            return 1, "", "error"

        assert read_current_fingerprint("eth0", run=fake_run) is None


class TestCakeSnapshotFunctions:
    def test_save_writes_parsed_params(self, tmp_path):
        def fake_run(cmd, **kw):
            if cmd[0] == "ip":
                return 0, json.dumps([{"ifindex": 2}]), ""
            return 0, json.dumps([{"kind": "cake", "handle": "801:", "root": True, "options": {"bandwidth": "50mbit", "rtt": "25ms"}}]), ""

        save_fn = make_save_cake_fn("eth0", run=fake_run)
        path = tmp_path / "snapshot.json"
        assert save_fn(path) is True
        data = json.loads(path.read_text())
        assert data["bandwidth_mbit"] == 50.0
        assert data["rtt_ms"] == 25

    def test_save_returns_false_when_not_cake(self, tmp_path):
        def fake_run(cmd, **kw):
            if cmd[0] == "ip":
                return 0, json.dumps([{"ifindex": 2}]), ""
            return 0, json.dumps([{"kind": "fq_codel", "handle": "801:", "root": True, "options": {}}]), ""

        save_fn = make_save_cake_fn("eth0", run=fake_run)
        path = tmp_path / "snapshot.json"
        assert save_fn(path) is False
        assert not path.exists()

    def test_apply_issues_tc_command(self, tmp_path):
        calls = []

        def fake_run(cmd, **kw):
            calls.append(cmd)
            return 0, "", ""

        path = tmp_path / "snapshot.json"
        path.write_text(json.dumps({"bandwidth_mbit": 47.0, "rtt_ms": 25}))

        apply_fn = make_apply_cake_fn("eth0", run=fake_run)
        result = apply_fn(path)
        assert result.success is True
        assert calls == [["tc", "qdisc", "change", "dev", "eth0", "root", "cake", "bandwidth", "47mbit", "rtt", "25ms"]]

    def test_apply_missing_file_fails_without_running_tc(self, tmp_path):
        calls = []

        def fake_run(cmd, **kw):
            calls.append(cmd)
            return 0, "", ""

        apply_fn = make_apply_cake_fn("eth0", run=fake_run)
        result = apply_fn(tmp_path / "does-not-exist.json")
        assert result.success is False
        assert calls == []

    def test_apply_reports_tc_failure(self, tmp_path):
        def fake_run(cmd, **kw):
            return 1, "", "RTNETLINK answers: Invalid argument"

        path = tmp_path / "snapshot.json"
        path.write_text(json.dumps({"bandwidth_mbit": 47.0, "rtt_ms": 25}))

        apply_fn = make_apply_cake_fn("eth0", run=fake_run)
        result = apply_fn(path)
        assert result.success is False
        assert "tc qdisc change failed" in result.reason

    def test_apply_bounds_oversized_tc_output(self, tmp_path):
        def fake_run(cmd, **kw):
            return 1, "", "x" * 200_000

        path = tmp_path / "snapshot.json"
        path.write_text(json.dumps({"bandwidth_mbit": 47.0, "rtt_ms": 25}))

        apply_fn = make_apply_cake_fn("eth0", run=fake_run)
        result = apply_fn(path)
        assert result.success is False
        assert len(result.reason.encode("utf-8")) < 70_000


def _store_with_pending(tmp_path, *, proposal=None, ifindex=2):
    store = ControllerStore(tmp_path / "ctrl.db")
    store.initialize()
    t = transition(ControllerState.OBSERVING, ControllerState.PROPOSAL_READY, "estimate_ready")
    event = ControlEvent(
        interface_name="eth0",
        ifindex=ifindex,
        transition=t,
        reason_code="estimate_ready",
        proposal=proposal or _proposal(),
    )
    event_id = store.append(event)
    return store, event_id


class TestApplyPendingProposalStorage:
    def test_no_pending_proposal_returns_early(self, tmp_path, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: True)
        store = ControllerStore(tmp_path / "ctrl.db")
        store.initialize()

        outcome = apply_pending_proposal(
            "eth0", store,
            expected_ifindex=2,
            expected_fingerprint_hash="x",
            now_monotonic_ns=0,
            old_snapshot_path=tmp_path / "old.json",
            new_snapshot_path=tmp_path / "new.json",
            gateway="192.168.1.1",
            target="1.1.1.1",
        )
        assert outcome == "no pending proposal"

    def test_missing_cap_net_admin_raises_before_touching_store(self, tmp_path, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: False)
        store, event_id = _store_with_pending(tmp_path)

        with pytest.raises(RuntimeError, match="CAP_NET_ADMIN"):
            apply_pending_proposal(
                "eth0", store,
                expected_ifindex=2,
                expected_fingerprint_hash="x",
                now_monotonic_ns=0,
                old_snapshot_path=tmp_path / "old.json",
                new_snapshot_path=tmp_path / "new.json",
                gateway="192.168.1.1",
                target="1.1.1.1",
            )
        # untouched: proposal is still pending, nothing was marked applied
        assert store.get_pending_proposal("eth0").event_id == event_id

    def test_validation_rejection_does_not_mark_applied(self, tmp_path, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: True)
        store, event_id = _store_with_pending(tmp_path, proposal=_proposal(schema_version=99))

        outcome = apply_pending_proposal(
            "eth0", store,
            expected_ifindex=2,
            expected_fingerprint_hash=_fp().normalized_hash(),
            now_monotonic_ns=0,
            old_snapshot_path=tmp_path / "old.json",
            new_snapshot_path=tmp_path / "new.json",
            gateway="192.168.1.1",
            target="1.1.1.1",
            run=lambda cmd, **kw: (0, json.dumps([{"ifindex": 2, "kind": "cake", "handle": "801:", "root": True, "options": {}}]), ""),
        )
        assert outcome.startswith("rejected:")
        assert not store.has_unresolved_pending("eth0")
        # still returned as pending — nothing was applied
        assert store.get_pending_proposal("eth0").event_id == event_id

    def test_successful_apply_marks_applied_and_confirmed(self, tmp_path, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: True)
        monkeypatch.setattr(mod, "read_current_fingerprint", lambda *a, **kw: _fp())

        store, event_id = _store_with_pending(tmp_path)

        def fake_run(cmd, **kw):
            return 0, "", ""

        def fake_ping_ok(_target):
            return True

        import probe.safety as safety_mod
        monkeypatch.setattr(safety_mod, "gateway_reachable", fake_ping_ok)
        monkeypatch.setattr(safety_mod, "public_path_reachable", fake_ping_ok)

        outcome = apply_pending_proposal(
            "eth0", store,
            expected_ifindex=2,
            expected_fingerprint_hash=_fp().normalized_hash(),
            now_monotonic_ns=0,
            old_snapshot_path=tmp_path / "old.json",
            new_snapshot_path=tmp_path / "new.json",
            gateway="192.168.1.1",
            target="1.1.1.1",
            run=fake_run,
        )
        assert outcome == "confirmed: proposal applied"
        assert store.get_pending_proposal("eth0") is None  # no longer "pending" once applied
        assert not store.has_unresolved_pending("eth0")  # confirmed clears "unresolved"

    def test_apply_failure_never_marks_applied(self, tmp_path, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: True)
        monkeypatch.setattr(mod, "read_current_fingerprint", lambda *a, **kw: _fp())

        store, event_id = _store_with_pending(tmp_path)

        # save succeeds (reads current fingerprint), but every tc call fails
        def fake_run(cmd, **kw):
            if cmd[0] == "tc" and cmd[2] == "change":
                return 1, "", "Invalid argument"
            return 0, "", ""

        outcome = apply_pending_proposal(
            "eth0", store,
            expected_ifindex=2,
            expected_fingerprint_hash=_fp().normalized_hash(),
            now_monotonic_ns=0,
            old_snapshot_path=tmp_path / "old.json",
            new_snapshot_path=tmp_path / "new.json",
            gateway="192.168.1.1",
            target="1.1.1.1",
            run=fake_run,
        )
        assert outcome.startswith("failed:")
        assert not store.has_unresolved_pending("eth0")

    def test_unreachable_after_apply_triggers_rollback_and_is_recorded(self, tmp_path, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: True)
        monkeypatch.setattr(mod, "read_current_fingerprint", lambda *a, **kw: _fp())

        store, event_id = _store_with_pending(tmp_path)

        def fake_run(cmd, **kw):
            return 0, "", ""

        import probe.safety as safety_mod
        monkeypatch.setattr(safety_mod, "gateway_reachable", lambda _t: False)
        monkeypatch.setattr(safety_mod, "public_path_reachable", lambda _t: True)

        outcome = apply_pending_proposal(
            "eth0", store,
            expected_ifindex=2,
            expected_fingerprint_hash=_fp().normalized_hash(),
            now_monotonic_ns=0,
            old_snapshot_path=tmp_path / "old.json",
            new_snapshot_path=tmp_path / "new.json",
            gateway="192.168.1.1",
            target="1.1.1.1",
            run=fake_run,
        )
        assert outcome.startswith("rollback:")
        assert not store.has_unresolved_pending("eth0")  # rollback_triggered clears "unresolved"

    def test_second_proposal_blocked_while_first_unresolved(self, tmp_path, monkeypatch):
        import probe.actuator_client as mod
        monkeypatch.setattr(mod, "_has_cap_net_admin", lambda: True)
        store, first_id = _store_with_pending(tmp_path)
        store.mark_applied(first_id)  # simulate an in-flight, unresolved change

        # a second proposal_ready row — this is the one apply_pending_proposal
        # should pick up and then reject for the still-unresolved first change
        t = transition(ControllerState.OBSERVING, ControllerState.PROPOSAL_READY, "estimate_ready")
        store.append(ControlEvent(
            interface_name="eth0", ifindex=2, transition=t,
            reason_code="estimate_ready", proposal=_proposal(),
        ))

        outcome = apply_pending_proposal(
            "eth0", store,
            expected_ifindex=2,
            expected_fingerprint_hash=_fp().normalized_hash(),
            now_monotonic_ns=0,
            old_snapshot_path=tmp_path / "old.json",
            new_snapshot_path=tmp_path / "new.json",
            gateway="192.168.1.1",
            target="1.1.1.1",
            run=lambda cmd, **kw: (0, json.dumps([{"ifindex": 2, "kind": "cake", "handle": "801:", "root": True, "options": {}}]), ""),
        )
        assert outcome == "rejected: unresolved_pending_change"
