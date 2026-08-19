"""Local network device inventory.

Reads the local ARP/neighbor table (the same "who's on my LAN" data your
router already tracks internally) and turns it into a plain-language
device list: how many devices, what kind of device where knowable, and
whether any of them are new since the last time this ran.

Read-only, local-only: this never queries any external service and never
changes network configuration. The vendor lookup is a small bundled table
(see oui_vendors.py) — not a live/cloud lookup.
"""

from __future__ import annotations

import re

from .oui_vendors import lookup_vendor
from .shell import run_command as _run

MAC_RE = re.compile(r"([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})")
IPV4_RE = re.compile(r"^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})")

_ZERO_MAC = "00:00:00:00:00:00"
_BROADCAST_MAC = "FF:FF:FF:FF:FF:FF"


def normalize_mac(mac: str) -> str:
    """Return *mac* as uppercase colon-separated, e.g. "3C:5A:B4:12:34:56"."""
    return mac.upper().replace("-", ":")


def is_locally_administered(mac: str) -> bool:
    """Return True if *mac* is a locally-administered address (IEEE 802 U/L bit).

    This is the same bit modern phones/laptops set when using a randomized
    "private" MAC address for privacy, instead of their real
    manufacturer-assigned hardware address. It is NOT a heuristic — it's
    bit 1 (the 0x02 bit) of the first octet, as defined by the 802
    standard: 0 = universally administered (manufacturer-assigned via
    IEEE OUI), 1 = locally administered (randomized or manually set).
    """
    first_octet = int(mac.split(":")[0], 16)
    return bool(first_octet & 0x02)


def is_multicast(mac: str) -> bool:
    """Return True if *mac*'s I/G bit marks it as multicast/broadcast, not a
    real device (e.g. a parsing artifact or a broadcast ARP entry)."""
    first_octet = int(mac.split(":")[0], 16)
    return bool(first_octet & 0x01)


def classify_mac(mac: str) -> dict:
    """Classify a normalized MAC address: vendor if known, or why not.

    type is one of:
      "known_vendor"        — matched our bundled OUI table
      "randomized_private"  — locally-administered bit set (privacy MAC)
      "unknown_vendor"      — universally administered but not in our table
    """
    oui = ":".join(mac.split(":")[:3])

    if is_locally_administered(mac):
        return {"mac": mac, "vendor": None, "type": "randomized_private"}

    vendor = lookup_vendor(oui)
    if vendor:
        return {"mac": mac, "vendor": vendor, "type": "known_vendor"}

    return {"mac": mac, "vendor": None, "type": "unknown_vendor"}


def _valid_device_mac(mac: str) -> bool:
    """Filter out zero/broadcast/multicast entries — never real devices."""
    if mac in (_ZERO_MAC, _BROADCAST_MAC):
        return False
    if is_multicast(mac):
        return False
    return True


def parse_ip_neigh(stdout: str) -> list[dict]:
    """Parse `ip neigh show` output into a list of {ip, mac} dicts.

    Skips entries with no learned MAC (e.g. state FAILED/INCOMPLETE) —
    those aren't devices we can identify, just ARP attempts in flight.
    """
    devices: list[dict] = []
    seen_macs: set[str] = set()

    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue

        ip_match = IPV4_RE.match(line)
        mac_match = MAC_RE.search(line)
        if not ip_match or not mac_match:
            continue

        mac = normalize_mac(mac_match.group(1))
        if not _valid_device_mac(mac) or mac in seen_macs:
            continue

        seen_macs.add(mac)
        devices.append({"ip": ip_match.group(1), "mac": mac})

    return devices


def parse_proc_net_arp(text: str) -> list[dict]:
    """Parse /proc/net/arp (the fallback when `ip` is unavailable).

    Format (whitespace-separated, header row first):
      IP address  HW type  Flags  HW address  Mask  Device
    Flags 0x2 means a complete (learned) entry; anything else (typically
    0x0) means the kernel hasn't resolved a MAC yet — skip those, same as
    the ip-neigh FAILED/INCOMPLETE case.
    """
    devices: list[dict] = []
    seen_macs: set[str] = set()

    lines = text.splitlines()
    for line in lines[1:]:  # skip header row
        parts = line.split()
        if len(parts) < 6:
            continue

        ip_addr, _hw_type, flags, hw_addr = parts[0], parts[1], parts[2], parts[3]

        if not MAC_RE.fullmatch(hw_addr):
            continue
        try:
            if int(flags, 16) & 0x2 == 0:
                continue
        except ValueError:
            continue

        mac = normalize_mac(hw_addr)
        if not _valid_device_mac(mac) or mac in seen_macs:
            continue

        seen_macs.add(mac)
        devices.append({"ip": ip_addr, "mac": mac})

    return devices


def get_local_devices(proc_arp_path: str = "/proc/net/arp") -> tuple[list[dict], str]:
    """Return (devices, source) — devices currently visible in the ARP table.

    Tries `ip neigh show` first, falls back to *proc_arp_path* (normally
    /proc/net/arp, overridable for tests), and returns an empty list with
    source="unavailable" if neither works — never raises, matching the
    rest of this project's graceful-degradation posture.
    """
    rc, stdout, _stderr = _run(["ip", "neigh", "show"])
    if rc == 0 and stdout:
        return parse_ip_neigh(stdout), "ip neigh"

    try:
        with open(proc_arp_path) as f:
            text = f.read()
        devices = parse_proc_net_arp(text)
        return devices, "/proc/net/arp"
    except OSError:
        return [], "unavailable"


def build_device_inventory() -> dict:
    """Return the current device inventory: raw devices plus vendor
    classification, ready to be diffed against a baseline or rendered.
    """
    devices, source = get_local_devices()

    classified = []
    for d in devices:
        info = classify_mac(d["mac"])
        classified.append({**d, **info})

    counts = {"known_vendor": 0, "randomized_private": 0, "unknown_vendor": 0}
    for d in classified:
        counts[d["type"]] += 1

    return {
        "source": source,
        "device_count": len(classified),
        "devices": classified,
        "counts": counts,
    }
