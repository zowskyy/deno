"""Shared subprocess helper with graceful handling of missing binaries.

gateway-probe must keep producing a report even when a system utility
(ping, ip, tc, dig, uci, ...) is absent or hangs — a missing binary is
diagnostic information, not a crash.
"""

from __future__ import annotations

import subprocess


def run_command(
    command: list[str],
    timeout: int = 15,
    input_text: str | None = None,
) -> tuple[int, str, str]:
    """Run *command*, returning (returncode, stdout, stderr).

    Never raises for a missing binary or a timeout: both are reported as a
    non-zero returncode with a descriptive stderr message instead.
    """
    try:
        result = subprocess.run(
            command,
            input=input_text,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except FileNotFoundError:
        return 127, "", f"command not found: {command[0]}"
    except subprocess.TimeoutExpired:
        return 124, "", f"command timed out after {timeout}s: {' '.join(command)}"
