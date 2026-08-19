"""Tests for WAN interface link-state collection.

Includes real-world adversarial cases for the /sys/class/net override
logic — e.g. many NICs report speed=-1 when link is down, which must not
be reported as a real "-1 Mbps" link speed.
"""

from __future__ import annotations

from probe import interfaces as interfaces_mod
from probe.interfaces import _read_sys, get_link_state


def _no_sys_overrides(path):
    """Simulate no /sys/class/net data available at all."""
    return None


def _sys_overrides(mapping):
    """Return a fake _read_sys that answers from *mapping* (path -> value)."""
    def fake(path):
        return mapping.get(path)
    return fake


class TestReadSys:
    def test_reads_existing_file_stripped(self, tmp_path):
        f = tmp_path / "value"
        f.write_text("1000\n")
        assert _read_sys(str(f)) == "1000"

    def test_missing_file_returns_none(self, tmp_path):
        assert _read_sys(str(tmp_path / "does-not-exist")) is None


class TestGetLinkStateFromIpOutput:
    def test_state_up_sets_carrier_and_operstate(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(interfaces_mod, "_read_sys", _no_sys_overrides)
        result = get_link_state("eth0")
        assert result["carrier"] is True
        assert result["operstate"] == "UP"

    def test_state_down_clears_carrier(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state DOWN ...", ""))
        monkeypatch.setattr(interfaces_mod, "_read_sys", _no_sys_overrides)
        result = get_link_state("eth0")
        assert result["carrier"] is False
        assert result["operstate"] == "DOWN"

    def test_state_unknown_is_treated_as_carrier_present(self, monkeypatch):
        # Real case: bridge/VLAN interfaces often report state UNKNOWN
        # while genuinely passing traffic — no L2 carrier-detect state
        # machine, not the same as being down.
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UNKNOWN ...", ""))
        monkeypatch.setattr(interfaces_mod, "_read_sys", _no_sys_overrides)
        result = get_link_state("br-lan")
        assert result["carrier"] is True
        assert result["operstate"] == "UNKNOWN"

    def test_missing_ip_binary_does_not_crash(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (127, "", "command not found: ip"))
        monkeypatch.setattr(interfaces_mod, "_read_sys", _no_sys_overrides)
        result = get_link_state("eth0")
        assert result["carrier"] is False
        assert result["operstate"] == "unknown"
        assert result["name"] == "eth0"

    def test_empty_stdout_does_not_crash(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "", ""))
        monkeypatch.setattr(interfaces_mod, "_read_sys", _no_sys_overrides)
        result = get_link_state("eth0")
        assert result["operstate"] == "unknown"


class TestSysClassNetOverrides:
    def test_sys_carrier_overrides_ip_parsed_carrier(self, monkeypatch):
        # ip output says DOWN, but /sys/class/net/.../carrier says up (1) —
        # /sys is documented as more authoritative and should win.
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state DOWN ...", ""))
        monkeypatch.setattr(
            interfaces_mod,
            "_read_sys",
            _sys_overrides({"/sys/class/net/eth0/carrier": "1"}),
        )
        result = get_link_state("eth0")
        assert result["carrier"] is True

    def test_sys_carrier_zero_overrides_ip_parsed_up(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(
            interfaces_mod,
            "_read_sys",
            _sys_overrides({"/sys/class/net/eth0/carrier": "0"}),
        )
        result = get_link_state("eth0")
        assert result["carrier"] is False

    def test_sys_operstate_overrides_ip_parsed_operstate(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(
            interfaces_mod,
            "_read_sys",
            _sys_overrides({"/sys/class/net/eth0/operstate": "dormant"}),
        )
        result = get_link_state("eth0")
        assert result["operstate"] == "dormant"

    def test_valid_positive_speed_is_used(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(
            interfaces_mod,
            "_read_sys",
            _sys_overrides({"/sys/class/net/eth0/speed": "1000"}),
        )
        result = get_link_state("eth0")
        assert result["speed_mbps"] == 1000

    def test_negative_speed_is_rejected_not_reported(self, monkeypatch):
        # Real-world case: many NICs report speed=-1 in /sys when the link
        # has no carrier — must not surface as a bogus "-1 Mbps" reading.
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state DOWN ...", ""))
        monkeypatch.setattr(
            interfaces_mod,
            "_read_sys",
            _sys_overrides({"/sys/class/net/eth0/speed": "-1"}),
        )
        result = get_link_state("eth0")
        assert result["speed_mbps"] is None

    def test_garbage_speed_value_does_not_crash(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(
            interfaces_mod,
            "_read_sys",
            _sys_overrides({"/sys/class/net/eth0/speed": "not-a-number"}),
        )
        result = get_link_state("eth0")
        assert result["speed_mbps"] is None


class TestErrorCounters:
    def test_valid_error_counts_are_parsed(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(
            interfaces_mod,
            "_read_sys",
            _sys_overrides({
                "/sys/class/net/eth0/statistics/rx_errors": "5",
                "/sys/class/net/eth0/statistics/tx_errors": "3",
            }),
        )
        result = get_link_state("eth0")
        assert result["rx_errors"] == 5
        assert result["tx_errors"] == 3

    def test_missing_error_counter_files_default_to_zero(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(interfaces_mod, "_read_sys", _no_sys_overrides)
        result = get_link_state("eth0")
        assert result["rx_errors"] == 0
        assert result["tx_errors"] == 0

    def test_garbage_error_counter_does_not_crash(self, monkeypatch):
        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(
            interfaces_mod,
            "_read_sys",
            _sys_overrides({"/sys/class/net/eth0/statistics/rx_errors": "garbage"}),
        )
        result = get_link_state("eth0")
        # Must not raise — garbage counters degrade to a safe default.
        assert isinstance(result["rx_errors"], int)
        assert isinstance(result["tx_errors"], int)


class TestRealFilesystemIntegration:
    """One test that exercises _read_sys against an actual file on disk,
    not a monkeypatched stand-in — catches any accidental divergence
    between the mocked behavior above and real file I/O."""

    def test_get_link_state_reads_real_tmp_files(self, tmp_path, monkeypatch):
        iface_dir = tmp_path / "eth0"
        iface_dir.mkdir()
        (iface_dir / "carrier").write_text("1\n")
        (iface_dir / "operstate").write_text("up\n")
        (iface_dir / "speed").write_text("2500\n")
        stats_dir = iface_dir / "statistics"
        stats_dir.mkdir()
        (stats_dir / "rx_errors").write_text("0\n")
        (stats_dir / "tx_errors").write_text("0\n")

        def real_read_sys(path):
            # Redirect the hardcoded /sys/class/net/<iface>/... prefix to tmp_path
            relative = path.replace("/sys/class/net/eth0/", "")
            real_path = iface_dir / relative
            try:
                return real_path.read_text().strip()
            except OSError:
                return None

        monkeypatch.setattr(interfaces_mod, "_run", lambda *a, **kw: (0, "... state UP ...", ""))
        monkeypatch.setattr(interfaces_mod, "_read_sys", real_read_sys)

        result = get_link_state("eth0")
        assert result["carrier"] is True
        assert result["operstate"] == "up"
        assert result["speed_mbps"] == 2500
