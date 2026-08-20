# iperf3 Integration

**Sources**: K26, K27

## Role

iperf3 is an optional external measurement dependency. It is not an always-
available subsystem. If the binary is absent, the version is incompatible,
or a measurement fails, the diagnostic core continues normally and reports
the failure category. The last valid measurement result is preserved.

## Invocation contract

The measurement runner must use a fixed argument array. No user input,
UCI value, or API parameter may be interpolated into a command string.

Example (illustrative):

```
execv("/usr/bin/iperf3", [
  "-c", validated_server_address,
  "-t", validated_duration_str,
  "-J",                           // JSON output
  "--connect-timeout", "5000",    // ms
  "--one-off",
  "--rcv-timeout", "5000",
  "--snd-timeout", "5000",
])
```

`validated_server_address` must match an allowlist of configured server
addresses, not be derived from an API parameter.

## Limits enforced by the runner

The runner enforces these limits independently of iperf3's own flags:

| Limit | Value | Notes |
|---|---|---|
| Maximum process lifetime | configurable, default 60 s | SIGKILL on expiry |
| Maximum output bytes | 1 MiB | Reject and report `malformed` if exceeded |
| Maximum parallel streams | configurable, bounded | Validated against allowlist |
| Maximum duration | configurable, bounded | Must not exceed process lifetime |
| Maximum bitrate | configurable, bounded | Per direction |
| Maximum connection timeout | 5 s | `--connect-timeout` |
| Maximum receive idle | 5 s | `--rcv-timeout` |

## Output modes

| Mode | Flag | Use |
|---|---|---|
| Complete JSON | `--json` | Default; emitted at test completion |
| JSON stream | `--json-stream` | Optional; newline-delimited during execution |

v1.0 uses complete JSON (`--json`). Streaming mode creates additional parser
and partial-result states and is deferred.

## JSON schema validation

The JSON output from iperf3 is treated as untrusted until validated:

1. Enforce maximum byte limit before parsing.
2. Validate top-level object structure against the expected schema.
3. Check for the `error` key before parsing results (iperf3 reports errors
   in JSON alongside, or instead of, results).
4. Validate all numeric fields are within expected ranges.
5. Reject any field that does not match the expected type.

The JSON schema evolves across iperf3 versions. The runner must:

- detect the installed iperf3 version (from `--version` output)
- apply the version-appropriate schema
- reject incompatible versions explicitly before running a measurement

## Version compatibility

| iperf3 version range | Support status |
|---|---|
| < 3.17 | Unsupported (security issues in older versions) |
| 3.17 – 3.20 | Supported with schema A |
| 3.21+ | Supported with schema B (millisecond timestamps, additional TCP fields) |

Schema differences must be handled explicitly, not by ignoring missing fields.

## Failure states

| Condition | Reported state |
|---|---|
| Binary absent | `unavailable` |
| Version incompatible | `unavailable` |
| Process timeout | `timeout` |
| Process killed before output | `timeout` |
| Output exceeds byte limit | `malformed` |
| Partial JSON (truncated) | `malformed` |
| Valid JSON with `error` key | `transport_error` or `unavailable` per error content |
| Schema validation failure | `malformed` |
| Server connection refused | `transport_error` |
| All streams fail | `transport_error` |
| Measurement result implausible | `partial` (flagged, not discarded) |

## Implausibility checks

The runner must flag measurements that are outside plausible ranges as
`partial` with a note, rather than silently accepting them:

- zero throughput when duration > 0 and no error → flag
- retransmit count exceeds total packets → flag
- RTT greater than 60 s → flag

A flagged measurement is preserved with its flag. It is not discarded and
not presented as a clean result.

## API exposure

iperf3 measurement parameters must not be exposed as unrestricted API
parameters. If UCI-configurable, they must be mapped from a small allowlist
of bounded UCI values. The API may expose the measurement result but must
not accept measurement configuration from an unauthenticated caller.
