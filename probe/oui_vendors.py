"""A small, curated MAC-address OUI (Organizationally Unique Identifier) to
vendor-name lookup table.

This is intentionally NOT the full IEEE registry (30,000+ entries) — that
would need a network fetch or a large bundled file, breaking this
project's local-only, no-cloud-dependency posture. Instead this covers a
practical set of common consumer-network vendors (phones, laptops, smart
speakers, streaming devices, routers). Anything not in this table is
reported as "Unknown vendor," never guessed.

Keys are the first 3 octets of a MAC address, uppercase, colon-separated
(e.g. "3C:5A:B4"). Values are short vendor labels the tool prints to
non-technical users.
"""

from __future__ import annotations

OUI_VENDORS: dict[str, str] = {
    # Apple
    "3C:5A:B4": "Apple",
    "A4:C3:61": "Apple",
    "F0:18:98": "Apple",
    "AC:BC:32": "Apple",
    "B8:63:4D": "Apple",
    "DC:A9:04": "Apple",
    "00:1B:63": "Apple",
    "F4:5C:89": "Apple",
    # Samsung
    "5C:0A:5B": "Samsung",
    "8C:71:F8": "Samsung",
    "CC:07:AB": "Samsung",
    "78:1F:DB": "Samsung",
    "00:12:FB": "Samsung",
    # Google
    "F4:F5:D8": "Google",
    "54:60:09": "Google",
    "A4:77:33": "Google",
    "1A:B7:E0": "Google (Chromecast/Nest)",
    # Amazon
    "F0:27:2D": "Amazon (Echo/Fire)",
    "68:37:E9": "Amazon (Echo/Fire)",
    "44:65:0D": "Amazon (Echo/Fire)",
    "AC:63:BE": "Amazon (Echo/Fire)",
    # Sonos
    "5C:AA:FD": "Sonos",
    "94:9F:3E": "Sonos",
    "00:0E:58": "Sonos",
    # Ring / smart-home
    "F0:F0:A4": "Ring",
    "AC:67:B2": "Ring",
    # Roku
    "B0:A7:37": "Roku",
    "D8:31:34": "Roku",
    "CC:6D:A0": "Roku",
    # Common router/networking vendors
    "00:1A:11": "Google",
    "B4:75:0E": "TP-Link",
    "50:C7:BF": "TP-Link",
    "AC:84:C6": "TP-Link",
    "98:DA:C4": "TP-Link",
    "E8:48:B8": "Netgear",
    "A0:40:A0": "Netgear",
    "20:E5:2A": "Netgear",
    "00:14:BF": "Netgear",
    "DC:9F:DB": "Ubiquiti",
    "78:8A:20": "Ubiquiti",
    "24:A4:3C": "Ubiquiti",
    "F0:9F:C2": "Ubiquiti",
    "00:24:A5": "Cisco",
    "00:1B:D5": "Cisco",
    "00:26:99": "Cisco",
    # Microsoft
    "00:15:5D": "Microsoft (Hyper-V/Xbox)",
    "7C:1E:52": "Microsoft (Xbox)",
    "98:5F:D3": "Microsoft (Xbox)",
    # Smart TVs
    "A8:23:FE": "LG",
    "AC:F1:08": "LG",
    "00:1E:75": "Samsung (TV)",
    "34:C3:AC": "Vizio",
    # Nintendo / gaming
    "00:1F:32": "Nintendo",
    "00:22:AA": "Nintendo",
    "98:B6:E9": "Nintendo",
    # Common PC network-card vendors
    "00:1C:42": "Parallels (VM)",
    "08:00:27": "VirtualBox (VM)",
    "00:0C:29": "VMware (VM)",
    "00:50:56": "VMware (VM)",
    "DC:A6:32": "Raspberry Pi",
    "B8:27:EB": "Raspberry Pi",
    "E4:5F:01": "Raspberry Pi",
}


def lookup_vendor(oui: str) -> str | None:
    """Return the vendor name for a normalized "AA:BB:CC" OUI, or None."""
    return OUI_VENDORS.get(oui)
