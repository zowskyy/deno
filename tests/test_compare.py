"""Tests for the idle-vs-loaded latency comparison tool."""

import json

import pytest

from probe.compare import (
    ReportLoadError,
    _load_report,
    _warn_if_likely_argument_swap,
    _warn_if_schema_version_mismatch,
    compare_reports,
    format_comparison_text,
    main,
)


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


class TestLoadReport:
    """_load_report must never let a raw exception escape — every
    foreseeable failure becomes a plain-language ReportLoadError,
    verified against the real filesystem/json behavior, not mocked."""

    def test_missing_file_raises_clear_error(self, tmp_path):
        with pytest.raises(ReportLoadError, match="not found"):
            _load_report(str(tmp_path / "does-not-exist.json"), "idle")

    def test_directory_instead_of_file_raises_clear_error(self, tmp_path):
        with pytest.raises(ReportLoadError, match="directory"):
            _load_report(str(tmp_path), "idle")

    def test_invalid_json_raises_clear_error(self, tmp_path):
        f = tmp_path / "bad.json"
        f.write_text("{not valid json")
        with pytest.raises(ReportLoadError, match="not valid JSON"):
            _load_report(str(f), "idle")

    def test_empty_file_raises_clear_error(self, tmp_path):
        f = tmp_path / "empty.json"
        f.write_text("")
        with pytest.raises(ReportLoadError, match="not valid JSON"):
            _load_report(str(f), "idle")

    def test_whitespace_only_file_raises_clear_error(self, tmp_path):
        f = tmp_path / "blank.json"
        f.write_text("   \n\n  ")
        with pytest.raises(ReportLoadError, match="not valid JSON"):
            _load_report(str(f), "idle")

    def test_valid_json_but_not_a_report_raises_clear_error(self, tmp_path):
        f = tmp_path / "unrelated.json"
        f.write_text(json.dumps({"foo": "bar", "baz": [1, 2, 3]}))
        with pytest.raises(ReportLoadError, match="does not look like a gateway-probe report"):
            _load_report(str(f), "idle")

    def test_json_array_instead_of_object_raises_clear_error(self, tmp_path):
        f = tmp_path / "array.json"
        f.write_text(json.dumps([1, 2, 3]))
        with pytest.raises(ReportLoadError, match="does not look like a gateway-probe report"):
            _load_report(str(f), "idle")

    def test_real_report_loads_successfully(self, tmp_path):
        f = tmp_path / "real.json"
        f.write_text(json.dumps(_report(10.0, 15.0)))
        report = _load_report(str(f), "idle")
        assert report["latency"]["mode"] == "idle"


class TestArgumentSwapWarning:
    def test_warns_when_idle_report_is_not_idle_mode(self, capsys):
        idle = _report(10.0, 95.0, mode="upload-loaded")
        loaded = _report(10.0, 15.0, mode="idle")
        _warn_if_likely_argument_swap(idle, loaded)
        err = capsys.readouterr().err
        assert "swap" in err.lower()

    def test_warns_when_loaded_report_is_idle_mode(self, capsys):
        idle = _report(10.0, 95.0, mode="upload-loaded")
        loaded = _report(10.0, 15.0, mode="idle")
        _warn_if_likely_argument_swap(idle, loaded)
        err = capsys.readouterr().err
        assert "swap" in err.lower()

    def test_no_warning_for_correctly_ordered_reports(self, capsys):
        idle = _report(10.0, 15.0, mode="idle")
        loaded = _report(20.0, 95.0, mode="upload-loaded")
        _warn_if_likely_argument_swap(idle, loaded)
        err = capsys.readouterr().err
        assert err == ""


class TestSchemaVersionWarning:
    def test_warns_on_mismatched_schema_versions(self, capsys):
        idle = {"schema_version": "0.1", "latency": {}}
        loaded = {"schema_version": "0.2", "latency": {}}
        _warn_if_schema_version_mismatch(idle, loaded)
        err = capsys.readouterr().err
        assert "schema_version" in err

    def test_no_warning_for_matching_schema_versions(self, capsys):
        idle = {"schema_version": "0.1", "latency": {}}
        loaded = {"schema_version": "0.1", "latency": {}}
        _warn_if_schema_version_mismatch(idle, loaded)
        err = capsys.readouterr().err
        assert err == ""


class TestMainCliErrorHandling:
    """End-to-end through main() — confirms these are actual clean exits
    with exit code 1 and a stderr message, not uncaught tracebacks."""

    def test_missing_idle_report_exits_cleanly(self, tmp_path, capsys):
        loaded_path = tmp_path / "loaded.json"
        loaded_path.write_text(json.dumps(_report(20.0, 95.0, mode="upload-loaded")))

        rc = main([str(tmp_path / "missing.json"), str(loaded_path)])

        assert rc == 1
        err = capsys.readouterr().err
        assert "error:" in err
        assert "not found" in err

    def test_invalid_json_exits_cleanly(self, tmp_path, capsys):
        idle_path = tmp_path / "idle.json"
        idle_path.write_text("{not json")
        loaded_path = tmp_path / "loaded.json"
        loaded_path.write_text(json.dumps(_report(20.0, 95.0, mode="upload-loaded")))

        rc = main([str(idle_path), str(loaded_path)])

        assert rc == 1
        err = capsys.readouterr().err
        assert "error:" in err

    def test_swapped_arguments_still_completes_but_warns(self, tmp_path, capsys):
        # Verified real-world consequence: swapping arguments flips the
        # interpretation to its opposite conclusion. The tool still runs
        # (it can't know FOR CERTAIN the user made a mistake) but must
        # warn loudly rather than silently reporting the wrong answer.
        idle_path = tmp_path / "idle.json"
        idle_path.write_text(json.dumps(_report(10.0, 15.0, mode="idle")))
        loaded_path = tmp_path / "loaded.json"
        loaded_path.write_text(json.dumps(_report(20.0, 95.0, mode="upload-loaded", cake_detected=False)))

        # Correct order first, to establish the true finding.
        rc_correct = main([str(idle_path), str(loaded_path)])
        correct_output = capsys.readouterr()
        assert rc_correct == 0
        assert "bufferbloat" in correct_output.err.lower()

        # Swapped order: same two files, arguments reversed.
        rc_swapped = main([str(loaded_path), str(idle_path)])
        swapped_output = capsys.readouterr()
        assert rc_swapped == 0
        assert "swap" in swapped_output.err.lower()


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
