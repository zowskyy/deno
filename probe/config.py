"""Configuration loading and defaults for gateway-probe."""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass
class RetentionConfig:
    """Storage retention policy."""
    max_database_mb: int = 100
    max_report_count: int = 10000
    full_report_days: int = 30
    raw_sample_days: int = 7
    daily_summary_days: int = 180
    vacuum_threshold_percent: int = 25


@dataclass
class APIConfig:
    """Dashboard API configuration."""
    bind_address: str = "127.0.0.1"
    port: int = 8734


@dataclass
class ProbeConfig:
    """Probe settings."""
    target: str = "1.1.1.1"
    dns_server: str = "1.1.1.1"
    wan_interface: str = ""
    gateway: str = ""


@dataclass
class LatencyConfig:
    """Latency test settings."""
    iperf_server: str = ""


@dataclass
class GatewayProbeConfig:
    """Top-level configuration."""
    probe: ProbeConfig
    latency: LatencyConfig
    retention: RetentionConfig
    api: APIConfig

    @staticmethod
    def defaults() -> GatewayProbeConfig:
        """Return configuration with all defaults."""
        return GatewayProbeConfig(
            probe=ProbeConfig(),
            latency=LatencyConfig(),
            retention=RetentionConfig(),
            api=APIConfig(),
        )

    @staticmethod
    def from_toml(path: str | Path) -> GatewayProbeConfig:
        """Load configuration from TOML file."""
        try:
            import tomllib
        except ModuleNotFoundError:
            import tomli as tomllib

        path = Path(path)
        if not path.exists():
            return GatewayProbeConfig.defaults()

        data = tomllib.loads(path.read_text())
        cfg = GatewayProbeConfig.defaults()

        if "probe" in data:
            for key, val in data["probe"].items():
                if hasattr(cfg.probe, key):
                    setattr(cfg.probe, key, val)

        if "latency" in data:
            for key, val in data["latency"].items():
                if hasattr(cfg.latency, key):
                    setattr(cfg.latency, key, val)

        if "retention" in data:
            for key, val in data["retention"].items():
                if hasattr(cfg.retention, key):
                    setattr(cfg.retention, key, val)

        if "api" in data:
            for key, val in data["api"].items():
                if hasattr(cfg.api, key):
                    setattr(cfg.api, key, val)

        return cfg

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "probe": asdict(self.probe),
            "latency": asdict(self.latency),
            "retention": asdict(self.retention),
            "api": asdict(self.api),
        }

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=2)
