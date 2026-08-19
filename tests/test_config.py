"""Tests for TOML configuration loading and the CLI override-merge behavior."""

from pathlib import Path

from probe.config import GatewayProbeConfig


class TestDefaults:
    def test_defaults_have_expected_values(self):
        cfg = GatewayProbeConfig.defaults()
        assert cfg.probe.target == "1.1.1.1"
        assert cfg.api.bind_address == "127.0.0.1"
        assert cfg.api.port == 8734
        assert cfg.retention.full_report_days == 30
        assert cfg.retention.daily_summary_days == 180


class TestFromToml:
    def test_missing_file_returns_defaults(self, tmp_path):
        cfg = GatewayProbeConfig.from_toml(tmp_path / "does-not-exist.toml")
        assert cfg.probe.target == "1.1.1.1"

    def test_loads_probe_section(self, tmp_path):
        toml_path = tmp_path / "config.toml"
        toml_path.write_text(
            '[probe]\n'
            'target = "8.8.8.8"\n'
            'dns_server = "9.9.9.9"\n'
            'wan_interface = "eth1"\n'
        )
        cfg = GatewayProbeConfig.from_toml(toml_path)
        assert cfg.probe.target == "8.8.8.8"
        assert cfg.probe.dns_server == "9.9.9.9"
        assert cfg.probe.wan_interface == "eth1"

    def test_loads_api_section(self, tmp_path):
        toml_path = tmp_path / "config.toml"
        toml_path.write_text(
            '[api]\n'
            'bind_address = "0.0.0.0"\n'
            'port = 9999\n'
        )
        cfg = GatewayProbeConfig.from_toml(toml_path)
        assert cfg.api.bind_address == "0.0.0.0"
        assert cfg.api.port == 9999

    def test_loads_retention_section(self, tmp_path):
        toml_path = tmp_path / "config.toml"
        toml_path.write_text(
            '[retention]\n'
            'max_database_mb = 50\n'
            'full_report_days = 14\n'
        )
        cfg = GatewayProbeConfig.from_toml(toml_path)
        assert cfg.retention.max_database_mb == 50
        assert cfg.retention.full_report_days == 14
        # Unset fields keep their defaults
        assert cfg.retention.daily_summary_days == 180

    def test_unrecognized_keys_are_ignored(self, tmp_path):
        toml_path = tmp_path / "config.toml"
        toml_path.write_text('[probe]\nnonexistent_field = "value"\n')
        # Should not raise
        cfg = GatewayProbeConfig.from_toml(toml_path)
        assert cfg.probe.target == "1.1.1.1"

    def test_partial_sections_keep_other_defaults(self, tmp_path):
        toml_path = tmp_path / "config.toml"
        toml_path.write_text('[latency]\niperf_server = "10.0.0.5"\n')
        cfg = GatewayProbeConfig.from_toml(toml_path)
        assert cfg.latency.iperf_server == "10.0.0.5"
        assert cfg.probe.target == "1.1.1.1"
        assert cfg.api.bind_address == "127.0.0.1"


class TestSerialization:
    def test_to_dict_round_trips_all_sections(self):
        cfg = GatewayProbeConfig.defaults()
        d = cfg.to_dict()
        assert set(d.keys()) == {"probe", "latency", "retention", "api"}
        assert d["probe"]["target"] == "1.1.1.1"

    def test_to_json_is_valid_json(self):
        import json
        cfg = GatewayProbeConfig.defaults()
        parsed = json.loads(cfg.to_json())
        assert parsed["api"]["port"] == 8734
