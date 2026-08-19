"""Tests for WAN interface auto-discovery from the default route.

Note: unlike the rest of probe/*.py, discovery.py calls subprocess.run
directly rather than going through probe.shell.run_command — so these
tests monkeypatch subprocess.run itself, and also verify real degradation
against an actually-missing binary, not just a mocked one.
"""

from __future__ import annotations

import subprocess

from probe import discovery as discovery_mod
from probe.discovery import discover_wan_interface


def _fake_result(stdout: str, returncode: int = 0):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr="")


class TestDiscoverWanInterface:
    def test_extracts_interface_from_default_route(self, monkeypatch):
        monkeypatch.setattr(
            discovery_mod.subprocess, "run", lambda *a, **kw: _fake_result("default via 192.168.1.1 dev eth0.2")
        )
        assert discover_wan_interface() == "eth0.2"

    def test_no_default_route_returns_none(self, monkeypatch):
        monkeypatch.setattr(discovery_mod.subprocess, "run", lambda *a, **kw: _fake_result(""))
        assert discover_wan_interface() is None

    def test_malformed_output_returns_none(self, monkeypatch):
        monkeypatch.setattr(discovery_mod.subprocess, "run", lambda *a, **kw: _fake_result("garbage nonsense"))
        assert discover_wan_interface() is None

    def test_missing_ip_binary_returns_none_not_raises(self, monkeypatch):
        def raise_not_found(*a, **kw):
            raise FileNotFoundError("ip: command not found")

        monkeypatch.setattr(discovery_mod.subprocess, "run", raise_not_found)
        assert discover_wan_interface() is None

    def test_timeout_returns_none_not_raises(self, monkeypatch):
        def raise_timeout(*a, **kw):
            raise subprocess.TimeoutExpired(cmd=["ip"], timeout=10)

        monkeypatch.setattr(discovery_mod.subprocess, "run", raise_timeout)
        assert discover_wan_interface() is None

    def test_interface_name_with_special_characters(self, monkeypatch):
        # VLAN-style interface names (dots) and bridge names (hyphens) are
        # both real, common cases on OpenWrt.
        monkeypatch.setattr(
            discovery_mod.subprocess, "run", lambda *a, **kw: _fake_result("default via 10.0.0.1 dev br-lan.100")
        )
        assert discover_wan_interface() == "br-lan.100"

    def test_real_missing_binary_end_to_end(self, monkeypatch):
        # Exercise the real subprocess.run/FileNotFoundError path against a
        # binary that genuinely does not exist, to catch any divergence
        # between the mocked behavior above and reality.
        real_run = subprocess.run
        monkeypatch.setattr(
            discovery_mod.subprocess,
            "run",
            lambda command, **kwargs: real_run(["this-binary-does-not-exist-xyz"], **kwargs),
        )
        assert discover_wan_interface() is None
