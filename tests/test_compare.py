"""Tests for the idle-vs-loaded latency comparison tool."""

from probe.compare import compare_reports, format_comparison_text


def _report(public_p50, public_p95, mode="idle", cake_detected=True, throughput=None, loss=0.0):
    return {
        "latency": {
            "mode": mode,
            "public_p50_ms": public_p50,
            "public_p95_ms": public_p95,
            "loaded_throughput_mbps": throughput,
            "loss_percent": loss,
        },
        "qdisc": {"cake_detected": cake_detected},
    }


class TestDeltaComputation:
    def test_computes_p50_and_p95_deltas(self):
        idle = _report(10.0, 15.0, mode="idle")
        loaded = _report(20.0, 165.0, mode="upload-loaded")

        result = compare_reports(idle, loaded)

        assert result["delta_rtt_p50_ms"] == 10.0
        assert result["delta_rtt_p95_ms"] == 150.0

    def test_missing_idle_data_yields_none_delta(self):
        idle = {"latency": {"mode": "idle", "public_p50_ms": None, "public_p95_ms": None}}
        loaded = _report(20.0, 165.0, mode="upload-loaded")

        result = compare_reports(idle, loaded)
        assert result["delta_rtt_p95_ms"] is None

    def test_carries_through_throughput_and_loss(self):
        idle = _report(10.0, 15.0, mode="idle")
        loaded = _report(20.0, 30.0, mode="download-loaded", throughput=450.5, loss=1.2)

        result = compare_reports(idle, loaded)
        assert result["throughput_mbps"] == 450.5
        assert result["packet_loss_percent"] == 1.2


class TestInterpretation:
    def test_small_delta_reports_no_bufferbloat(self):
        idle = _report(10.0, 15.0)
        loaded = _report(20.0, 30.0, mode="upload-loaded")  # delta = 15ms

        result = compare_reports(idle, loaded)
        assert "minimal" in result["interpretation"].lower()

    def test_moderate_delta_reports_borderline(self):
        idle = _report(10.0, 15.0)
        loaded = _report(20.0, 50.0, mode="upload-loaded")  # delta = 35ms

        result = compare_reports(idle, loaded)
        assert "borderline" in result["interpretation"].lower()

    def test_large_delta_without_cake_recommends_cake(self):
        idle = _report(10.0, 15.0)
        loaded = _report(20.0, 165.0, mode="upload-loaded", cake_detected=False)  # delta = 150ms

        result = compare_reports(idle, loaded)
        assert "enabling cake" in result["interpretation"].lower()

    def test_large_delta_with_cake_suggests_tuning(self):
        idle = _report(10.0, 15.0)
        loaded = _report(20.0, 165.0, mode="upload-loaded", cake_detected=True)  # delta = 150ms

        result = compare_reports(idle, loaded)
        assert "cake" in result["interpretation"].lower()
        assert "tuning" in result["interpretation"].lower() or "lowering" in result["interpretation"].lower()


class TestFormatting:
    def test_format_includes_label_for_upload_mode(self):
        idle = _report(10.0, 15.0)
        loaded = _report(20.0, 165.0, mode="upload-loaded", cake_detected=False)
        text = format_comparison_text(compare_reports(idle, loaded))
        assert text.startswith("Upload queue delay:")

    def test_format_includes_label_for_download_mode(self):
        idle = _report(10.0, 15.0)
        loaded = _report(20.0, 165.0, mode="download-loaded", cake_detected=False)
        text = format_comparison_text(compare_reports(idle, loaded))
        assert text.startswith("Download queue delay:")

    def test_format_includes_delta_and_interpretation(self):
        idle = _report(10.0, 15.0)
        loaded = _report(20.0, 165.0, mode="upload-loaded", cake_detected=False)
        text = format_comparison_text(compare_reports(idle, loaded))
        assert "Delta (queue delay): 150 ms" in text
        assert "Interpretation:" in text
