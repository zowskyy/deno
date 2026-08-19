"""Tests for routing table parsing."""

from __future__ import annotations

from probe import routes as routes_mod
from probe.routes import get_default_gateway, get_route_table


class TestGetDefaultGateway:
    def test_parses_gateway_from_default_route(self, monkeypatch):
        monkeypatch.setattr(
            routes_mod, "_run", lambda *a, **kw: (0, "default via 192.168.1.1 dev eth0.2", "")
        )
        assert get_default_gateway() == "192.168.1.1"

    def test_no_default_route_returns_none(self, monkeypatch):
        monkeypatch.setattr(routes_mod, "_run", lambda *a, **kw: (0, "", ""))
        assert get_default_gateway() is None

    def test_missing_ip_binary_returns_none_not_crash(self, monkeypatch):
        monkeypatch.setattr(routes_mod, "_run", lambda *a, **kw: (127, "", "command not found: ip"))
        assert get_default_gateway() is None

    def test_garbage_output_returns_none(self, monkeypatch):
        monkeypatch.setattr(routes_mod, "_run", lambda *a, **kw: (0, "not a route line at all", ""))
        assert get_default_gateway() is None


class TestGetRouteTable:
    def test_default_route_present_when_gateway_found(self, monkeypatch):
        monkeypatch.setattr(
            routes_mod,
            "_run",
            lambda *a, **kw: (0, "default via 192.168.1.1 dev eth0.2 proto static", ""),
        )
        result = get_route_table()
        assert result["default_route_present"] is True
        assert result["gateway"] == "192.168.1.1"
        assert len(result["routes"]) == 1
        assert result["routes"][0]["gateway"] == "192.168.1.1"
        assert result["routes"][0]["dev"] == "eth0.2"
        assert result["routes"][0]["prefix"] == "default"

    def test_directly_connected_route_has_no_gateway_key(self, monkeypatch):
        # A local subnet route (e.g. "192.168.1.0/24 dev eth0.2 proto kernel
        # scope link src 192.168.1.1") legitimately has no "via" — must not
        # crash or invent a gateway value for it.
        monkeypatch.setattr(
            routes_mod,
            "_run",
            lambda *a, **kw: (0, "192.168.1.0/24 dev eth0.2 proto kernel scope link src 192.168.1.1", ""),
        )
        result = get_route_table()
        assert len(result["routes"]) == 1
        entry = result["routes"][0]
        assert "gateway" not in entry
        assert entry["dev"] == "eth0.2"
        assert entry["src"] == "192.168.1.1"
        assert entry["prefix"] == "192.168.1.0/24"

    def test_no_routes_at_all_when_ip_missing(self, monkeypatch):
        monkeypatch.setattr(routes_mod, "_run", lambda *a, **kw: (127, "", "command not found: ip"))
        result = get_route_table()
        assert result["default_route_present"] is False
        assert result["gateway"] is None
        assert result["routes"] == []

    def test_multiple_routes_all_parsed(self, monkeypatch):
        stdout = (
            "default via 192.168.1.1 dev eth0.2\n"
            "192.168.1.0/24 dev eth0.2 proto kernel scope link src 192.168.1.10\n"
            "10.0.0.0/8 via 192.168.1.254 dev eth0.2\n"
        )
        monkeypatch.setattr(routes_mod, "_run", lambda *a, **kw: (0, stdout, ""))
        result = get_route_table()
        assert len(result["routes"]) == 3

    def test_blank_lines_in_output_are_skipped(self, monkeypatch):
        stdout = "default via 192.168.1.1 dev eth0.2\n\n\n"
        monkeypatch.setattr(routes_mod, "_run", lambda *a, **kw: (0, stdout, ""))
        result = get_route_table()
        assert len(result["routes"]) == 1

    def test_raw_line_is_preserved_for_debugging(self, monkeypatch):
        stdout = "default via 192.168.1.1 dev eth0.2"
        monkeypatch.setattr(routes_mod, "_run", lambda *a, **kw: (0, stdout, ""))
        result = get_route_table()
        assert result["routes"][0]["raw"] == stdout
