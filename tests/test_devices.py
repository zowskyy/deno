"""Tests for local device inventory: MAC classification and ARP parsing.

Includes deliberately adversarial cases (malformed lines, incomplete ARP
entries, broadcast/multicast noise) alongside the happy path — a parser
that only handles clean input isn't trustworthy on a real router.
"""

from __future__ import annotations

from probe import devices as devices_mod
from probe.devices import (
    build_device_inventory,
    classify_mac,
    get_local_devices,
    is_locally_administered,
    is_multicast,
    normalize_mac,
    parse_ip_neigh,
    parse_proc_net_arp,
)


class TestNormalizeMac:
    def test_uppercases_and_keeps_colons(self):
        assert normalize_mac("3c:5a:b4:12:34:56") == "3C:5A:B4:12:34:56"

    def test_converts_hyphens_to_colons(self):
        assert normalize_mac("3c-5a-b4-12-34-56") == "3C:5A:B4:12:34:56"


class TestLocallyAdministeredBit:
    """IEEE 802 U/L bit (0x02 of the first octet) — real spec, not a
    heuristic. This is exactly the bit modern OSes set for randomized
    "private" MAC addresses."""

    def test_real_vendor_mac_is_not_locally_administered(self):
        # 0x3C = 0011_1100 -> bit 0x02 is clear
        assert is_locally_administered("3C:5A:B4:12:34:56") is False

    def test_canonical_locally_administered_example(self):
        # 0x02 = 0000_0010 -> bit 0x02 is set; this is the textbook example
        assert is_locally_administered("02:00:00:00:00:01") is True

    def test_another_universally_administered_example(self):
        # 0x00 = 0000_0000 -> bit 0x02 clear
        assert is_locally_administered("00:1A:11:22:33:44") is False

    def test_bit_set_in_a_realistic_randomized_prefix(self):
        # 0x8A = 1000_1010 -> bit 0x02 is set (a plausible iOS-style private MAC)
        assert is_locally_administered("8A:12:34:56:78:9A") is True


class TestMulticastBit:
    def test_real_unicast_vendor_mac_is_not_multicast(self):
        assert is_multicast("3C:5A:B4:12:34:56") is False

    def test_ipv4_multicast_prefix_is_detected(self):
        # 01:00:5E:.. is the real, standard IPv4-multicast MAC prefix
        assert is_multicast("01:00:5E:00:00:01") is True

    def test_broadcast_address_is_multicast(self):
        assert is_multicast("FF:FF:FF:FF:FF:FF") is True


class TestClassifyMac:
    def test_known_vendor_oui_is_classified(self):
        result = classify_mac("3C:5A:B4:12:34:56")
        assert result["type"] == "known_vendor"
        assert result["vendor"] == "Apple"

    def test_locally_administered_is_private_regardless_of_oui_table(self):
        result = classify_mac("02:00:00:00:00:01")
        assert result["type"] == "randomized_private"
        assert result["vendor"] is None

    def test_unrecognized_universal_oui_is_unknown_not_guessed(self):
        result = classify_mac("11:22:33:44:55:66")
        assert result["type"] == "unknown_vendor"
        assert result["vendor"] is None


class TestParseIpNeigh:
    def test_parses_reachable_and_stale_entries(self):
        output = (
            "192.168.1.5 dev br-lan lladdr 3c:5a:b4:12:34:56 STALE\n"
            "192.168.1.10 dev br-lan lladdr aa:bb:cc:dd:ee:ff REACHABLE\n"
        )
        result = parse_ip_neigh(output)
        assert len(result) == 2
        assert result[0] == {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56"}

    def test_failed_entry_with_no_mac_is_skipped(self):
        output = "192.168.1.20 dev br-lan  FAILED\n"
        assert parse_ip_neigh(output) == []

    def test_garbage_line_does_not_crash(self):
        output = "not a real arp line at all $$$ ???\n"
        assert parse_ip_neigh(output) == []

    def test_duplicate_mac_is_deduplicated(self):
        output = (
            "192.168.1.5 dev br-lan lladdr 3c:5a:b4:12:34:56 REACHABLE\n"
            "fe80::1 dev br-lan lladdr 3c:5a:b4:12:34:56 STALE\n"
        )
        result = parse_ip_neigh(output)
        assert len(result) == 1

    def test_broadcast_mac_is_filtered_out(self):
        output = "192.168.1.255 dev br-lan lladdr ff:ff:ff:ff:ff:ff REACHABLE\n"
        assert parse_ip_neigh(output) == []

    def test_empty_output_returns_empty_list(self):
        assert parse_ip_neigh("") == []


class TestParseProcNetArp:
    HEADER = "IP address       HW type     Flags       HW address            Mask     Device\n"

    def test_parses_complete_entry(self):
        text = self.HEADER + "192.168.1.5      0x1         0x2         3c:5a:b4:12:34:56     *        br-lan\n"
        result = parse_proc_net_arp(text)
        assert result == [{"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56"}]

    def test_incomplete_entry_flags_zero_is_skipped(self):
        text = self.HEADER + "192.168.1.20     0x1         0x0         00:00:00:00:00:00     *        br-lan\n"
        assert parse_proc_net_arp(text) == []

    def test_malformed_short_line_does_not_crash(self):
        text = self.HEADER + "garbage line\n"
        assert parse_proc_net_arp(text) == []

    def test_non_hex_flags_does_not_crash(self):
        text = self.HEADER + "192.168.1.5 0x1 zz 3c:5a:b4:12:34:56 * br-lan\n"
        assert parse_proc_net_arp(text) == []

    def test_header_only_returns_empty_list(self):
        assert parse_proc_net_arp(self.HEADER) == []


class TestGetLocalDevices:
    def test_uses_ip_neigh_when_available(self, monkeypatch):
        monkeypatch.setattr(
            devices_mod,
            "_run",
            lambda *a, **kw: (0, "192.168.1.5 dev br-lan lladdr 3c:5a:b4:12:34:56 REACHABLE", ""),
        )
        result, source = get_local_devices()
        assert source == "ip neigh"
        assert len(result) == 1

    def test_falls_back_to_proc_net_arp_when_ip_missing(self, monkeypatch, tmp_path):
        monkeypatch.setattr(devices_mod, "_run", lambda *a, **kw: (127, "", "command not found: ip"))
        arp_path = tmp_path / "arp"
        arp_path.write_text(
            "IP address HW type Flags HW address Mask Device\n"
            "192.168.1.5 0x1 0x2 3c:5a:b4:12:34:56 * br-lan\n"
        )
        result, source = get_local_devices(proc_arp_path=str(arp_path))
        assert source == "/proc/net/arp"
        assert len(result) == 1

    def test_returns_unavailable_when_neither_source_works(self, monkeypatch, tmp_path):
        monkeypatch.setattr(devices_mod, "_run", lambda *a, **kw: (127, "", "command not found: ip"))
        missing_path = tmp_path / "does-not-exist"
        result, source = get_local_devices(proc_arp_path=str(missing_path))
        assert result == []
        assert source == "unavailable"


class TestBuildDeviceInventory:
    def test_counts_devices_by_classification_type(self, monkeypatch):
        monkeypatch.setattr(
            devices_mod,
            "get_local_devices",
            lambda: (
                [
                    {"ip": "192.168.1.5", "mac": "3C:5A:B4:12:34:56"},   # known vendor: Apple
                    {"ip": "192.168.1.6", "mac": "02:00:00:00:00:01"},  # randomized
                    {"ip": "192.168.1.7", "mac": "11:22:33:44:55:66"},  # unknown
                ],
                "ip neigh",
            ),
        )
        inv = build_device_inventory()
        assert inv["device_count"] == 3
        assert inv["counts"] == {"known_vendor": 1, "randomized_private": 1, "unknown_vendor": 1}

    def test_empty_device_list_is_handled(self, monkeypatch):
        monkeypatch.setattr(devices_mod, "get_local_devices", lambda: ([], "ip neigh"))
        inv = build_device_inventory()
        assert inv["device_count"] == 0
        assert inv["devices"] == []
