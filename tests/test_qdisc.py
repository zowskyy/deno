"""Tests for CAKE/qdisc statistics parsing."""

from __future__ import annotations

from probe import qdisc as qdisc_mod
from probe.qdisc import get_qdisc_stats

SINGLE_TIN_CAKE_OUTPUT = """qdisc cake 8001: root refcnt 2 bandwidth 50Mbit diffserv3 dual-srchost nat nowash no-ack-filter split-gso rtt 100.0ms noatm overhead 18
 Sent 12345678 bytes 9876 pkt (dropped 42, overlimits 100 requeues 0)
 backlog 0b 0p requeues 0
 memory used: 12345b of 4Mb
 capacity estimate: 50Mbit
 min/max network layer size:           28 /    1514
 min/max overhead-adjusted size:       46 /    1532
 average network hdr offset:           14

                   Tin 0
  thresh        50Mbit
  target           5.0ms
  interval       100.0ms
  pk_delay          0us
  av_delay          0us
  sp_delay          0us
  backlog            0b
  pkts               9876
  bytes          12345678
  way_inds              0
  way_miss              5
  way_cols              0
  drops                42
  marks                17
  ack_drop              0
  sp_flows               1
  bk_flows               0
  un_flows               0
  max_len             1514
  quantum              300
"""

MULTI_TIN_CAKE_OUTPUT = """qdisc cake 8002: root refcnt 2 bandwidth 50Mbit diffserv4 dual-srchost nat nowash no-ack-filter split-gso rtt 100.0ms noatm overhead 18
 Sent 99999999 bytes 88888 pkt (dropped 200, overlimits 500 requeues 0)
 backlog 1500b 3p requeues 0
 memory used: 54321b of 4Mb
 capacity estimate: 50Mbit

                   Tin 0            Tin 1            Tin 2            Tin 3
  thresh        50Mbit           50Mbit           50Mbit           50Mbit
  target          5.0ms            5.0ms            5.0ms            5.0ms
  pk_delay          0us              0us              0us              0us
  drops                 0               50               30               10
  marks                 0               20               15                5
  backlog               0b               0b            1500b               0b
  pkts               1000              500              200              100
"""

NO_CAKE_OUTPUT = """qdisc fq_codel 0: root refcnt 2 limit 10240p flows 1024 quantum 1514 target 5ms interval 100ms memory_limit 32Mb ecn drop_batch 64
 Sent 555 bytes 10 pkt (dropped 0, overlimits 0 requeues 0)
 backlog 0b 0p requeues 0
"""


class TestCakeDetection:
    def test_detects_cake_qdisc(self, monkeypatch):
        monkeypatch.setattr(qdisc_mod, "_run", lambda *a, **kw: (0, SINGLE_TIN_CAKE_OUTPUT, ""))
        result = get_qdisc_stats("eth0.2")
        assert result["cake_detected"] is True

    def test_no_cake_when_other_qdisc_present(self, monkeypatch):
        monkeypatch.setattr(qdisc_mod, "_run", lambda *a, **kw: (0, NO_CAKE_OUTPUT, ""))
        result = get_qdisc_stats("eth0.2")
        assert result["cake_detected"] is False

    def test_missing_tc_binary_produces_no_crash(self, monkeypatch):
        monkeypatch.setattr(qdisc_mod, "_run", lambda *a, **kw: (127, "", "command not found: tc"))
        result = get_qdisc_stats("eth0.2")
        assert result["cake_detected"] is False
        assert result["drops"] is None
        assert result["marks"] is None


class TestDropsAndMarks:
    def test_single_tin_marks_and_drops(self, monkeypatch):
        monkeypatch.setattr(qdisc_mod, "_run", lambda *a, **kw: (0, SINGLE_TIN_CAKE_OUTPUT, ""))
        result = get_qdisc_stats("eth0.2")
        # "dropped Z" summary line takes precedence for drops
        assert result["drops"] == 42
        assert result["marks"] == 17

    def test_multi_tin_marks_are_summed_across_all_tins(self, monkeypatch):
        monkeypatch.setattr(qdisc_mod, "_run", lambda *a, **kw: (0, MULTI_TIN_CAKE_OUTPUT, ""))
        result = get_qdisc_stats("eth0.2")
        # Regression guard: previously `marks\s+(\d+)` only captured the
        # first tin's value on the "marks" line (0, in this fixture),
        # completely missing marks on any other tin. Real CAKE diffserv3/4
        # output (a common OpenWrt SQM preset) prints one "marks" line with
        # one space-separated value per tin: 0 + 20 + 15 + 5 = 40.
        assert result["marks"] == 40
        assert result["drops"] == 200  # from the single top-level "dropped Z" summary

    def test_multi_tin_backlog_uses_first_match(self, monkeypatch):
        monkeypatch.setattr(qdisc_mod, "_run", lambda *a, **kw: (0, MULTI_TIN_CAKE_OUTPUT, ""))
        result = get_qdisc_stats("eth0.2")
        assert result["backlog_bytes"] == 1500

    def test_no_stats_when_qdisc_missing(self, monkeypatch):
        monkeypatch.setattr(qdisc_mod, "_run", lambda *a, **kw: (0, "", ""))
        result = get_qdisc_stats("eth0.2")
        assert result["drops"] is None
        assert result["marks"] is None
        assert result["raw"] is None
