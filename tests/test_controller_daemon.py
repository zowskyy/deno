"""Tests for the observe-only controller daemon entry point."""

from __future__ import annotations

import pytest

from probe.controller_daemon import _has_cap_net_admin, main, run_observe_only


class TestCapNetAdminCheck:
    def test_returns_bool(self):
        result = _has_cap_net_admin()
        assert isinstance(result, bool)

    def test_fake_proc_status_with_no_cap(self, tmp_path, monkeypatch):
        import probe.controller_daemon as daemon_mod
        status = tmp_path / "status"
        status.write_text("CapEff:\t0000000000000000\n", encoding="ascii")
        monkeypatch.setattr(daemon_mod, "_PROC_STATUS_PATH", str(status))
        assert not daemon_mod._has_cap_net_admin()

    def test_fake_proc_status_with_cap_net_admin(self, tmp_path, monkeypatch):
        import probe.controller_daemon as daemon_mod
        status = tmp_path / "status"
        # bit 12 set (CAP_NET_ADMIN)
        status.write_text("CapEff:\t0000000000001000\n", encoding="ascii")
        monkeypatch.setattr(daemon_mod, "_PROC_STATUS_PATH", str(status))
        assert daemon_mod._has_cap_net_admin()


class TestRunObserveOnly:
    def test_cap_net_admin_raises(self, monkeypatch, tmp_path):
        import probe.controller_daemon as daemon_mod
        monkeypatch.setattr(daemon_mod, "_has_cap_net_admin", lambda: True)
        with pytest.raises(RuntimeError, match="CAP_NET_ADMIN"):
            run_observe_only(store_path=str(tmp_path / "ctrl.db"), interval_seconds=60.0)


class TestMain:
    def test_non_observe_only_mode_exits(self, monkeypatch):
        import sys
        monkeypatch.setattr(sys, "argv", ["ctrl", "--store", "/tmp/x.db", "--mode", "controller_owned_qdisc"])
        with pytest.raises(SystemExit):
            main()

    def test_interval_too_small_exits(self, monkeypatch):
        import sys
        monkeypatch.setattr(sys, "argv", ["ctrl", "--store", "/tmp/x.db", "--interval-seconds", "1"])
        with pytest.raises(SystemExit):
            main()

    def test_interval_too_large_exits(self, monkeypatch):
        import sys
        monkeypatch.setattr(sys, "argv", ["ctrl", "--store", "/tmp/x.db", "--interval-seconds", "9999"])
        with pytest.raises(SystemExit):
            main()
