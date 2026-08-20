"""Tests for read-only qdisc fingerprint types."""

from __future__ import annotations

import pytest

from probe.qdisc_fingerprint import QdiscFingerprint, validate_fingerprint


def _fp(**overrides):
    defaults = dict(
        interface_name="eth0",
        ifindex=2,
        kind="cake",
        handle="801:",
        parent="root",
        options={"bandwidth": "100mbit"},
    )
    defaults.update(overrides)
    return QdiscFingerprint(**defaults)


class TestValidation:
    def test_valid_cake_fingerprint_passes(self):
        validate_fingerprint(_fp())

    def test_valid_gp_fingerprint_passes(self):
        validate_fingerprint(_fp(kind="gp"))

    def test_unsupported_kind_raises(self):
        with pytest.raises(ValueError, match="unsupported"):
            validate_fingerprint(_fp(kind="fq_codel"))

    def test_empty_interface_name_raises(self):
        with pytest.raises(ValueError):
            validate_fingerprint(_fp(interface_name=""))

    def test_too_long_interface_name_raises(self):
        with pytest.raises(ValueError):
            validate_fingerprint(_fp(interface_name="a" * 16))

    def test_zero_ifindex_raises(self):
        with pytest.raises(ValueError):
            validate_fingerprint(_fp(ifindex=0))

    def test_negative_ifindex_raises(self):
        with pytest.raises(ValueError):
            validate_fingerprint(_fp(ifindex=-1))

    def test_empty_handle_raises(self):
        with pytest.raises(ValueError):
            validate_fingerprint(_fp(handle=""))

    def test_empty_parent_raises(self):
        with pytest.raises(ValueError):
            validate_fingerprint(_fp(parent=""))


class TestNormalizedHash:
    def test_same_fingerprint_produces_same_hash(self):
        a = _fp()
        b = _fp()
        assert a.normalized_hash() == b.normalized_hash()

    def test_different_kind_produces_different_hash(self):
        a = _fp(kind="cake")
        b = _fp(kind="gp")
        assert a.normalized_hash() != b.normalized_hash()

    def test_different_ifindex_produces_different_hash(self):
        a = _fp(ifindex=2)
        b = _fp(ifindex=3)
        assert a.normalized_hash() != b.normalized_hash()

    def test_hash_is_64_hex_chars(self):
        h = _fp().normalized_hash()
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)
