"""Tests for DNS resolution probing: the dig-based path and its
socket.getaddrinfo fallback when dig isn't installed."""

from __future__ import annotations

from probe import dns as dns_mod
from probe.dns import _parse_dig_time, probe_dns


class TestParseDigTime:
    def test_extracts_query_time_in_ms(self):
        stdout = "Query time: 23 msec\nSERVER: 1.1.1.1#53\n"
        assert _parse_dig_time(stdout) == 23.0

    def test_missing_query_time_returns_none(self):
        assert _parse_dig_time("no timing info here") is None

    def test_empty_output_returns_none(self):
        assert _parse_dig_time("") is None


class TestProbeDnsWithoutDig:
    """dig missing entirely — falls back to a single socket.getaddrinfo call."""

    def test_successful_socket_lookup(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: None)
        monkeypatch.setattr(dns_mod.socket, "getaddrinfo", lambda *a, **kw: [("fake", "result")])
        result = probe_dns(hostname="example.com", server="1.1.1.1")
        assert result["success"] is True
        assert result["error"] is None
        assert result["query_ms"] is not None
        assert result["query_ms"] == result["p95_ms"]  # single sample, no distribution

    def test_socket_lookup_failure_is_reported_not_raised(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: None)

        def raise_oserror(*a, **kw):
            raise OSError("Name or service not known")

        monkeypatch.setattr(dns_mod.socket, "getaddrinfo", raise_oserror)
        result = probe_dns(hostname="nonexistent.invalid")
        assert result["success"] is False
        assert result["query_ms"] is None
        assert "not known" in result["error"]

    def test_hostname_and_server_are_echoed_back(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: None)
        monkeypatch.setattr(dns_mod.socket, "getaddrinfo", lambda *a, **kw: [("fake",)])
        result = probe_dns(hostname="test.example", server="8.8.8.8")
        assert result["hostname"] == "test.example"
        assert result["server"] == "8.8.8.8"


class TestProbeDnsWithDig:
    def test_all_samples_succeed(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        monkeypatch.setattr(
            dns_mod, "_run", lambda *a, **kw: (0, "Query time: 20 msec", "")
        )
        result = probe_dns(hostname="example.com", server="1.1.1.1", samples=5)
        assert result["success"] is True
        assert result["query_ms"] == 20.0
        assert result["p95_ms"] == 20.0
        assert result["error"] is None

    def test_partial_failures_still_succeed_using_available_samples(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        call_count = {"n": 0}

        def flaky_run(*a, **kw):
            call_count["n"] += 1
            if call_count["n"] % 2 == 0:
                return (1, "", "timed out")
            return (0, "Query time: 15 msec", "")

        monkeypatch.setattr(dns_mod, "_run", flaky_run)
        result = probe_dns(hostname="example.com", samples=5)
        assert result["success"] is True
        assert result["query_ms"] == 15.0

    def test_all_samples_fail_with_nonzero_rc(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        monkeypatch.setattr(dns_mod, "_run", lambda *a, **kw: (1, "", "connection refused"))
        result = probe_dns(hostname="example.com", samples=3)
        assert result["success"] is False
        assert result["query_ms"] is None
        assert "connection refused" in result["error"]

    def test_all_samples_succeed_but_output_is_unparseable(self, monkeypatch):
        # rc=0 (dig "succeeded") but the output doesn't contain a
        # recognizable "Query time:" line on any attempt — must fall
        # through to the "all queries failed" message, not crash on an
        # empty times list.
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        monkeypatch.setattr(dns_mod, "_run", lambda *a, **kw: (0, "unexpected garbage output", ""))
        result = probe_dns(hostname="example.com", samples=3)
        assert result["success"] is False
        assert result["error"] == "all queries failed"

    def test_missing_dig_binary_via_run_still_handled(self, monkeypatch):
        # shutil.which lies (or dig is removed between the check and the
        # call) — _run's own rc=127 path must still degrade gracefully.
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        monkeypatch.setattr(dns_mod, "_run", lambda *a, **kw: (127, "", "command not found: dig"))
        result = probe_dns(hostname="example.com", samples=2)
        assert result["success"] is False
        assert "command not found" in result["error"]

    def test_server_flag_included_when_server_given(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        captured_commands = []

        def spy_run(command, *a, **kw):
            captured_commands.append(command)
            return (0, "Query time: 10 msec", "")

        monkeypatch.setattr(dns_mod, "_run", spy_run)
        probe_dns(hostname="example.com", server="9.9.9.9", samples=1)
        assert "@9.9.9.9" in captured_commands[0]

    def test_no_server_flag_when_server_is_none(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        captured_commands = []

        def spy_run(command, *a, **kw):
            captured_commands.append(command)
            return (0, "Query time: 10 msec", "")

        monkeypatch.setattr(dns_mod, "_run", spy_run)
        probe_dns(hostname="example.com", server=None, samples=1)
        assert not any(c.startswith("@") for c in captured_commands[0])

    def test_p95_and_median_computed_correctly_across_distinct_samples(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        # 5 distinct query times, returned in this exact order across calls.
        values = [10, 50, 20, 40, 30]
        call_count = {"n": 0}

        def sequential_run(*a, **kw):
            v = values[call_count["n"]]
            call_count["n"] += 1
            return (0, f"Query time: {v} msec", "")

        monkeypatch.setattr(dns_mod, "_run", sequential_run)
        result = probe_dns(hostname="example.com", samples=5)
        # sorted: [10, 20, 30, 40, 50] -> p50 index len//2=2 -> 30
        # p95 index max(0, int(5*0.95)-1) = max(0,3) = 3 -> 40
        assert result["query_ms"] == 30.0
        assert result["p95_ms"] == 40.0

    def test_single_sample_uses_same_value_for_median_and_p95(self, monkeypatch):
        monkeypatch.setattr(dns_mod.shutil, "which", lambda _name: "/usr/bin/dig")
        monkeypatch.setattr(dns_mod, "_run", lambda *a, **kw: (0, "Query time: 42 msec", ""))
        result = probe_dns(hostname="example.com", samples=1)
        assert result["query_ms"] == 42.0
        assert result["p95_ms"] == 42.0
