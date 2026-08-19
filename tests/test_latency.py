"""Tests for loaded-latency probing and load_validation evidence tracking."""

from __future__ import annotations

import json

import pytest

from probe import latency as latency_mod
from probe.latency import (
    DEFAULT_MIN_VALID_THROUGHPUT_MBPS,
    _iperf3_throughput,
    probe_loaded_latency,
)


def _fake_ping_result(success=True, p50=10.0, p95=15.0, loss=0.0, samples=20):
    return {
        "success": success,
        "p50_ms": p50,
        "p95_ms": p95,
        "loss_percent": loss,
        "samples": samples,
    }


class TestIperf3Throughput:
    def test_missing_binary_reports_limitation(self, monkeypatch):
        monkeypatch.setattr(latency_mod.shutil, "which", lambda _name: None)
        throughput, limitation = _iperf3_throughput("10.0.0.1", 5, False)
        assert throughput is None
        assert "not installed" in limitation

    def test_timeout_reports_limitation(self, monkeypatch):
        monkeypatch.setattr(latency_mod.shutil, "which", lambda _name: "/usr/bin/iperf3")
        monkeypatch.setattr(latency_mod, "_run", lambda *a, **kw: (124, "", "timed out"))
        throughput, limitation = _iperf3_throughput("10.0.0.1", 5, False)
        assert throughput is None
        assert "timed out" in limitation

    def test_nonzero_exit_reports_limitation(self, monkeypatch):
        monkeypatch.setattr(latency_mod.shutil, "which", lambda _name: "/usr/bin/iperf3")
        monkeypatch.setattr(latency_mod, "_run", lambda *a, **kw: (1, "", "connection refused"))
        throughput, limitation = _iperf3_throughput("10.0.0.1", 5, False)
        assert throughput is None
        assert "connection refused" in limitation

    def test_malformed_json_reports_limitation(self, monkeypatch):
        monkeypatch.setattr(latency_mod.shutil, "which", lambda _name: "/usr/bin/iperf3")
        monkeypatch.setattr(latency_mod, "_run", lambda *a, **kw: (0, "not json", ""))
        throughput, limitation = _iperf3_throughput("10.0.0.1", 5, False)
        assert throughput is None
        assert "parse" in limitation

    def test_successful_run_returns_throughput_and_no_limitation(self, monkeypatch):
        monkeypatch.setattr(latency_mod.shutil, "which", lambda _name: "/usr/bin/iperf3")
        payload = json.dumps({"end": {"sum_received": {"bits_per_second": 50_000_000}}})
        monkeypatch.setattr(latency_mod, "_run", lambda *a, **kw: (0, payload, ""))
        throughput, limitation = _iperf3_throughput("10.0.0.1", 5, False)
        assert throughput == 50.0
        assert limitation is None


class TestLoadValidation:
    def test_idle_mode_is_always_valid(self, monkeypatch):
        monkeypatch.setattr(latency_mod, "probe_ping", lambda *a, **kw: _fake_ping_result())
        result = probe_loaded_latency("1.1.1.1", "192.168.1.1", "idle")
        assert result["load_validation"]["valid_for_wan_comparison"] is True

    def test_missing_iperf_server_marks_invalid_with_limitation(self, monkeypatch):
        monkeypatch.setattr(latency_mod, "probe_ping", lambda *a, **kw: _fake_ping_result())
        result = probe_loaded_latency("1.1.1.1", "192.168.1.1", "upload-loaded", iperf_server=None)
        assert result["load_validation"]["valid_for_wan_comparison"] is False
        assert any("no --iperf-server" in lim for lim in result["load_validation"]["limitations"])

    def test_throughput_below_threshold_marks_invalid_with_reason(self, monkeypatch):
        monkeypatch.setattr(latency_mod, "probe_ping", lambda *a, **kw: _fake_ping_result())
        monkeypatch.setattr(latency_mod, "_iperf3_throughput", lambda *a, **kw: (2.0, None))
        result = probe_loaded_latency(
            "1.1.1.1", "192.168.1.1", "upload-loaded", iperf_server="10.0.0.1", duration=5
        )
        assert result["load_validation"]["valid_for_wan_comparison"] is False
        assert result["load_validation"]["iperf_reported_throughput_mbps"] == 2.0
        assert any("validity threshold" in lim for lim in result["load_validation"]["limitations"])

    def test_throughput_above_threshold_marks_valid(self, monkeypatch):
        monkeypatch.setattr(latency_mod, "probe_ping", lambda *a, **kw: _fake_ping_result())
        monkeypatch.setattr(latency_mod, "_iperf3_throughput", lambda *a, **kw: (50.0, None))
        result = probe_loaded_latency(
            "1.1.1.1", "192.168.1.1", "upload-loaded", iperf_server="10.0.0.1", duration=5
        )
        assert result["load_validation"]["valid_for_wan_comparison"] is True
        assert result["load_validation"]["limitations"] == []

    def test_iperf_failure_propagates_limitation_and_marks_invalid(self, monkeypatch):
        monkeypatch.setattr(latency_mod, "probe_ping", lambda *a, **kw: _fake_ping_result())
        monkeypatch.setattr(
            latency_mod, "_iperf3_throughput", lambda *a, **kw: (None, "iperf3 is not installed on this host")
        )
        result = probe_loaded_latency(
            "1.1.1.1", "192.168.1.1", "upload-loaded", iperf_server="10.0.0.1", duration=5
        )
        assert result["load_validation"]["valid_for_wan_comparison"] is False
        assert "iperf3 is not installed on this host" in result["load_validation"]["limitations"]

    def test_custom_threshold_is_respected(self, monkeypatch):
        monkeypatch.setattr(latency_mod, "probe_ping", lambda *a, **kw: _fake_ping_result())
        monkeypatch.setattr(latency_mod, "_iperf3_throughput", lambda *a, **kw: (2.0, None))
        result = probe_loaded_latency(
            "1.1.1.1",
            "192.168.1.1",
            "upload-loaded",
            iperf_server="10.0.0.1",
            duration=5,
            min_valid_throughput_mbps=1.0,
        )
        assert result["load_validation"]["valid_for_wan_comparison"] is True

    def test_direction_recorded_for_upload_and_download(self, monkeypatch):
        monkeypatch.setattr(latency_mod, "probe_ping", lambda *a, **kw: _fake_ping_result())
        monkeypatch.setattr(latency_mod, "_iperf3_throughput", lambda *a, **kw: (50.0, None))

        upload = probe_loaded_latency(
            "1.1.1.1", "192.168.1.1", "upload-loaded", iperf_server="10.0.0.1", duration=5
        )
        download = probe_loaded_latency(
            "1.1.1.1", "192.168.1.1", "download-loaded", iperf_server="10.0.0.1", duration=5
        )
        assert upload["load_validation"]["requested_direction"] == "upload"
        assert download["load_validation"]["requested_direction"] == "download"
