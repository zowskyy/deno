"""Tests for the gateway-probe-devices CLI entry point."""

from __future__ import annotations

import json

from probe import devices_cli as cli_mod


def _fake_report(**overrides) -> dict:
    report = {
        "schema_version": "0.1",
        "timestamp": "2026-01-01T00:00:00Z",
        "source": "ip neigh",
        "device_count": 1,
        "counts": {"known_vendor": 1, "randomized_private": 0, "unknown_vendor": 0},
        "devices": [{"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56", "vendor": "Apple", "type": "known_vendor"}],
        "new_device_count": None,
        "new_devices": None,
        "is_first_scan": None,
        "summary": "You have 1 device connected: 1 Apple.",
    }
    report.update(overrides)
    return report


class TestBasicRun:
    def test_prints_json_to_stdout(self, monkeypatch, capsys):
        monkeypatch.setattr(cli_mod, "build_device_report", lambda **kw: _fake_report())
        rc = cli_mod.main([])
        assert rc == 0
        out = capsys.readouterr().out
        parsed = json.loads(out)
        assert parsed["device_count"] == 1

    def test_prints_summary_to_stderr(self, monkeypatch, capsys):
        monkeypatch.setattr(cli_mod, "build_device_report", lambda **kw: _fake_report())
        cli_mod.main([])
        err = capsys.readouterr().err
        assert "You have 1 device connected" in err


class TestStoreFlag:
    def test_store_path_is_passed_through(self, monkeypatch, tmp_path):
        captured = {}

        def fake_build(**kwargs):
            captured.update(kwargs)
            return _fake_report()

        monkeypatch.setattr(cli_mod, "build_device_report", fake_build)
        db_path = str(tmp_path / "devices.db")
        cli_mod.main(["--store", db_path])
        assert captured["db_path"] == db_path

    def test_no_store_flag_passes_none(self, monkeypatch):
        captured = {}

        def fake_build(**kwargs):
            captured.update(kwargs)
            return _fake_report()

        monkeypatch.setattr(cli_mod, "build_device_report", fake_build)
        cli_mod.main([])
        assert captured["db_path"] is None


class TestOutputFlag:
    def test_writes_to_file_when_output_given(self, monkeypatch, tmp_path):
        monkeypatch.setattr(cli_mod, "build_device_report", lambda **kw: _fake_report())
        out_path = tmp_path / "report.json"
        cli_mod.main(["--output", str(out_path)])
        assert out_path.exists()
        parsed = json.loads(out_path.read_text())
        assert parsed["device_count"] == 1


class TestNewDevicesDisplay:
    def test_new_devices_are_listed_on_stderr(self, monkeypatch, capsys):
        report = _fake_report(
            new_devices=[
                {"mac": "11:22:33:44:55:66", "vendor": None, "type": "unknown_vendor", "ip": "192.168.1.9"}
            ]
        )
        monkeypatch.setattr(cli_mod, "build_device_report", lambda **kw: report)
        cli_mod.main([])
        err = capsys.readouterr().err
        assert "11:22:33:44:55:66" in err
        assert "New devices:" in err

    def test_no_new_devices_section_when_none(self, monkeypatch, capsys):
        monkeypatch.setattr(cli_mod, "build_device_report", lambda **kw: _fake_report(new_devices=None))
        cli_mod.main([])
        err = capsys.readouterr().err
        assert "New devices:" not in err
