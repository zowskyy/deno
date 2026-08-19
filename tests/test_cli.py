"""Tests for the CLI entry point's config-merge and auto-discovery logic.

build_report and discover_wan_interface are monkeypatched throughout so
these tests never touch real network tools — they verify argument/config
wiring, not the probes themselves (see test_latency.py, test_dns.py-style
collectors for that).
"""

from __future__ import annotations

import json

import pytest

from probe import cli as cli_mod


def _minimal_report(**overrides) -> dict:
    report = {
        "schema_version": "0.1",
        "timestamp": "2026-08-18T21:40:00Z",
        "host": {"hostname": "test", "platform": "test"},
        "interface": {"name": "eth0", "carrier": True, "speed_mbps": 1000, "rx_errors": 0, "tx_errors": 0},
        "routing": {"default_route_present": True, "gateway": "192.168.1.1"},
        "latency": {"mode": "idle", "target": "1.1.1.1", "success": True},
        "dns": {"server": "1.1.1.1", "success": True},
        "qdisc": {"interface": "eth0", "cake_detected": False},
        "findings": [],
    }
    report.update(overrides)
    return report


class TestTargetDefault:
    def test_target_defaults_to_cloudflare_without_config(self, monkeypatch, capsys):
        captured_kwargs = {}

        def fake_build_report(**kwargs):
            captured_kwargs.update(kwargs)
            return _minimal_report()

        monkeypatch.setattr(cli_mod, "discover_wan_interface", lambda: None)
        monkeypatch.setattr(cli_mod, "build_report", fake_build_report)

        rc = cli_mod.main(["--wan-interface", "eth0"])
        assert rc == 0
        assert captured_kwargs["target"] == "1.1.1.1"

    def test_explicit_target_flag_overrides_default(self, monkeypatch):
        captured_kwargs = {}

        def fake_build_report(**kwargs):
            captured_kwargs.update(kwargs)
            return _minimal_report()

        monkeypatch.setattr(cli_mod, "build_report", fake_build_report)

        cli_mod.main(["--wan-interface", "eth0", "--target", "8.8.8.8"])
        assert captured_kwargs["target"] == "8.8.8.8"


class TestConfigMerge:
    def test_config_file_target_is_honored_when_no_cli_flag(self, tmp_path, monkeypatch):
        config_path = tmp_path / "config.toml"
        config_path.write_text('[probe]\ntarget = "9.9.9.9"\n')

        captured_kwargs = {}

        def fake_build_report(**kwargs):
            captured_kwargs.update(kwargs)
            return _minimal_report()

        monkeypatch.setattr(cli_mod, "build_report", fake_build_report)

        cli_mod.main(["--wan-interface", "eth0", "--config", str(config_path)])
        assert captured_kwargs["target"] == "9.9.9.9"

    def test_cli_target_flag_overrides_config_file(self, tmp_path, monkeypatch):
        config_path = tmp_path / "config.toml"
        config_path.write_text('[probe]\ntarget = "9.9.9.9"\n')

        captured_kwargs = {}

        def fake_build_report(**kwargs):
            captured_kwargs.update(kwargs)
            return _minimal_report()

        monkeypatch.setattr(cli_mod, "build_report", fake_build_report)

        cli_mod.main([
            "--wan-interface", "eth0",
            "--config", str(config_path),
            "--target", "1.2.3.4",
        ])
        assert captured_kwargs["target"] == "1.2.3.4"

    def test_config_file_dns_server_is_honored(self, tmp_path, monkeypatch):
        config_path = tmp_path / "config.toml"
        config_path.write_text('[probe]\ndns_server = "8.8.4.4"\n')

        captured_kwargs = {}

        def fake_build_report(**kwargs):
            captured_kwargs.update(kwargs)
            return _minimal_report()

        monkeypatch.setattr(cli_mod, "build_report", fake_build_report)

        cli_mod.main(["--wan-interface", "eth0", "--config", str(config_path)])
        assert captured_kwargs["dns_server"] == "8.8.4.4"

    def test_missing_config_file_falls_back_to_defaults(self, tmp_path, monkeypatch):
        captured_kwargs = {}

        def fake_build_report(**kwargs):
            captured_kwargs.update(kwargs)
            return _minimal_report()

        monkeypatch.setattr(cli_mod, "build_report", fake_build_report)

        cli_mod.main([
            "--wan-interface", "eth0",
            "--config", str(tmp_path / "does-not-exist.toml"),
        ])
        assert captured_kwargs["target"] == "1.1.1.1"


class TestAutoDiscoveryFailure:
    def test_returns_error_when_no_interface_and_discovery_fails(self, monkeypatch, capsys):
        monkeypatch.setattr(cli_mod, "discover_wan_interface", lambda: None)
        rc = cli_mod.main([])
        assert rc == 1
        captured = capsys.readouterr()
        assert "could not auto-discover" in captured.err

    def test_uses_discovered_interface_when_not_specified(self, monkeypatch):
        captured_kwargs = {}

        def fake_build_report(**kwargs):
            captured_kwargs.update(kwargs)
            return _minimal_report()

        monkeypatch.setattr(cli_mod, "discover_wan_interface", lambda: "eth1")
        monkeypatch.setattr(cli_mod, "build_report", fake_build_report)

        cli_mod.main([])
        assert captured_kwargs["wan_interface"] == "eth1"


class TestStoreAndRetention:
    def test_store_flag_persists_report_and_runs_retention(self, tmp_path, monkeypatch):
        db_path = tmp_path / "events.db"

        monkeypatch.setattr(cli_mod, "build_report", lambda **kwargs: _minimal_report())

        rc = cli_mod.main(["--wan-interface", "eth0", "--store", str(db_path)])
        assert rc == 0

        from probe.store import list_reports, open_store
        conn = open_store(db_path)
        assert len(list_reports(conn)) == 1
