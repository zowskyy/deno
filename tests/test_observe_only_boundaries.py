"""Source-level enforcement tests: forbidden tokens and scaffold guards."""

from __future__ import annotations

import ast
from pathlib import Path


def _source(path: str) -> str:
    file_path = Path(path)
    assert file_path.exists(), f"missing expected file: {path}"
    return file_path.read_text(encoding="utf-8")


def test_observe_only_modules_have_no_forbidden_tokens() -> None:
    paths = (
        "probe/controller_daemon.py",
        "probe/controller_policy.py",
        "probe/controller_state.py",
        "probe/rate_estimator.py",
        "probe/qdisc_fingerprint.py",
    )
    forbidden = (
        "subprocess",
        "actuator_client",
        "os.system",
        "os.popen",
        "shell=True",
        "RTM_NEWQDISC",
        "RTM_DELQDISC",
    )
    for path in paths:
        tree = ast.parse(_source(path), filename=path)
        normalized = ast.unparse(tree)
        for token in forbidden:
            assert token not in normalized, f"{path!r} contains forbidden token {token!r}"


def test_qdisc_fingerprint_references_netlink_and_not_sysfs() -> None:
    source = _source("probe/qdisc_fingerprint.py")
    assert "RTM_GETQDISC" in source, "fingerprint docstring must mention RTM_GETQDISC"
    assert "tc -j qdisc show dev" in source, "fingerprint docstring must mention tc fallback"
    assert '"/sys/' not in source
    assert "Path(" not in source


def test_kernel_scaffold_has_no_qdisc_implementation() -> None:
    source = _source("kqdisc/sch_gp.c")
    forbidden = (
        "register_qdisc",
        "struct Qdisc_ops",
        ".enqueue",
        ".dequeue",
        ".peek",
        "netlink",
        "rtnetlink",
    )
    for token in forbidden:
        assert token not in source, f"sch_gp.c contains forbidden token {token!r}"
