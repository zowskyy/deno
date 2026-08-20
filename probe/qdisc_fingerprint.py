"""Read-only qdisc identity types for controller ownership checks.

These types model a qdisc's identity for the purpose of comparing "is
this still the qdisc the controller created" across cycles. This module
does no collection itself — collecting the fingerprint is the caller's
responsibility, and it must be done via a Netlink RTM_GETQDISC dump
first, falling back only to `tc -j qdisc show dev <iface>` when Netlink
is unavailable. Fingerprints are NEVER inferred from sysfs.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

_SUPPORTED_KINDS = {"cake", "gp"}
_MAX_INTERFACE_NAME_LENGTH = 15


@dataclass(frozen=True)
class QdiscFingerprint:
    interface_name: str
    ifindex: int
    kind: str
    handle: str
    parent: str
    options: dict

    def normalized_hash(self) -> str:
        payload = json.dumps(
            {
                "interface_name": self.interface_name,
                "ifindex": self.ifindex,
                "kind": self.kind,
                "handle": self.handle,
                "parent": self.parent,
                "options": self.options,
            },
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def validate_fingerprint(fingerprint: QdiscFingerprint) -> None:
    if not fingerprint.interface_name:
        raise ValueError("interface_name must be non-empty")
    if len(fingerprint.interface_name) > _MAX_INTERFACE_NAME_LENGTH:
        raise ValueError(
            f"interface_name exceeds {_MAX_INTERFACE_NAME_LENGTH} characters"
        )
    if fingerprint.ifindex <= 0:
        raise ValueError("ifindex must be > 0")
    if fingerprint.kind not in _SUPPORTED_KINDS:
        raise ValueError(f"unsupported qdisc kind: {fingerprint.kind!r}")
    if not fingerprint.handle:
        raise ValueError("handle must be non-empty")
    if not fingerprint.parent:
        raise ValueError("parent must be non-empty")
