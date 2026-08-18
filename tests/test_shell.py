"""Tests for the shared subprocess helper's graceful-degradation behavior."""

from probe.shell import run_command


class TestMissingBinary:
    def test_missing_binary_returns_127_instead_of_raising(self):
        rc, stdout, stderr = run_command(["this-binary-does-not-exist-xyz"])
        assert rc == 127
        assert stdout == ""
        assert "not found" in stderr


class TestTimeout:
    def test_timeout_returns_124_instead_of_raising(self):
        rc, stdout, stderr = run_command(["sleep", "5"], timeout=0.05)
        assert rc == 124
        assert "timed out" in stderr


class TestSuccess:
    def test_successful_command_returns_stripped_output(self):
        rc, stdout, stderr = run_command(["echo", "hello"])
        assert rc == 0
        assert stdout == "hello"
