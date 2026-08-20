# Failure Model

**Sources**: K02, K03, K05, K09, K10, K11, K12, K13, K14, K15, K19, K20, K21,
K24, K25, K26, K27

## Scope

This document defines failure handling for the v1.0 read-only diagnostic core
on OpenWrt. It covers collection, parsing, persistence, service supervision,
and the local API.

The system must degrade explicitly. It must not crash, silently discard data,
or convert unavailable measurements into valid zero values.

## Failure-handling principles

1. Every external operation has a timeout or bounded completion condition.
2. Every parser validates lengths, types, ranges, and nesting depth.
3. Missing capabilities are reported as unavailable, not as zero.
4. A failure in one collector must not terminate unrelated collectors.
5. Persistence failure must not terminate diagnostic collection.
6. Configuration-changing behavior is excluded from the v1.0 diagnostic core.
7. Recovery attempts are bounded and observable.
8. Logs must contain a stable failure category and a human-readable detail.
9. Sensitive request data must not be copied into logs.
10. The service must remain restartable after every failure class.

## Failure-state vocabulary

| State | Meaning |
|---|---|
| `healthy` | Collection completed and the result passed validation |
| `unavailable` | Required kernel feature, utility, device, or interface is absent |
| `unsupported` | Target exists, but the requested operation is not supported |
| `timeout` | Operation exceeded its deadline |
| `malformed` | Input was present but failed structural validation |
| `permission_denied` | Operation requires privileges that are not available |
| `transport_error` | Socket, file, or process communication failed |
| `partial` | Some requested fields were collected, but others failed |
| `persist_failed` | Collection succeeded but durable storage failed |
| `storage_full` | Storage backend rejected writes because it is full |
| `storage_corrupt` | Integrity validation failed |
| `rate_limited` | Caller exceeded API request limits |
| `internal_error` | Unexpected invariant or implementation failure occurred |
| `recovering` | System is performing a bounded recovery action |

## Failure matrix

| Component | Failure | Required behavior | Recovery | Reported state |
|---|---|---|---|---|
| Netlink socket | socket creation fails | Do not crash; mark collector unavailable | Retry on next collection cycle | `transport_error` |
| Netlink request | send fails | Discard only the current request | Reopen socket if necessary | `transport_error` |
| Netlink response | truncated datagram | Reject the response | Retry once within bounded budget | `malformed` |
| Netlink response | invalid length or alignment | Reject the message and remaining dump | Do not parse unchecked bytes | `malformed` |
| Netlink dump | `NLM_F_DUMP_INTR` | Do not claim a consistent snapshot | Retry up to three times | `partial` |
| Netlink operation | `EOPNOTSUPP` or missing family | Preserve other collectors | Use fallback source | `unsupported` |
| Netlink privilege | `EPERM` or `EACCES` | Do not escalate privileges dynamically | Use unprivileged fallback | `permission_denied` |
| Sysfs/procfs | file missing | Treat the field as unavailable | Continue with other fields | `unavailable` |
| Sysfs/procfs | malformed numeric value | Reject only that field | Log source and field name | `malformed` |
| Controlled utility | executable missing | Do not invoke a shell | Continue without the utility | `unavailable` |
| Controlled utility | timeout | Kill only the child process if safe | Apply backoff before retry | `timeout` |
| Controlled utility | unexpected output | Reject output; do not guess | Preserve Netlink/sysfs result | `malformed` |
| Collector | one field fails | Keep valid fields | Return a partial result | `partial` |
| Collector | entire subsystem fails | Keep unrelated subsystems running | Retry next cycle | `unavailable` |
| SQLite open | database cannot open | Continue in non-persistent mode | Retry with bounded backoff | `persist_failed` |
| SQLite write | `SQLITE_BUSY` | Roll back current transaction | Retry bounded times | `persist_failed` |
| SQLite write | `SQLITE_FULL` | Stop writes before repeated failure | Emit storage alarm | `storage_full` |
| SQLite write | `SQLITE_IOERR` | Roll back and close connection | Reopen later | `persist_failed` |
| SQLite integrity | check fails | Do not write new records | Quarantine database for recovery | `storage_corrupt` |
| SQLite journal | WAL/journal remains after crash | Let SQLite perform recovery | Validate after reopen | `recovering` |
| API request | invalid method/path | Do not dispatch | Return client error | `malformed` |
| API request | body/header too large | Reject before parsing body | No retry | `malformed` |
| API request | unauthenticated | Do not expose diagnostics by default | Require configured authorization | `permission_denied` |
| API request | excessive frequency | Reject without invoking collectors | Retry after limit window | `rate_limited` |
| API request | collector unavailable | Return structured degraded response | Do not hide subsystem state | `unavailable` → HTTP 503 |
| Service startup | dependency absent | Start in degraded mode if safe | Retry dependency discovery | `unavailable` |
| Service runtime | child or worker exits | Supervisor restarts with backoff | Cap restart frequency | `internal_error` |
| Configuration | invalid UCI value | Preserve previous valid configuration | Report validation error | `malformed` |
| Configuration | unreadable UCI state | Use safe defaults only if documented | Do not apply guessed settings | `unavailable` |
| Storage capacity | low free space | Reduce retention before failure | Emit warning and enforce quota | `storage_full` |
| Clock | time invalid or unsynchronized | Preserve monotonic durations | Mark wall-clock timestamps uncertain | `partial` |

## Collection result contract

Every collection result must contain:

- collection timestamp (UTC)
- monotonic duration
- source identifier
- capability state (per-family)
- per-field availability
- failure category, if any
- whether the result is complete or partial

A failed field must remain distinguishable from a measured zero.

## SQLite storage state model

```
healthy
degraded_write_failed
degraded_read_only
corrupt
full
unavailable
recovering
```

The critical distinction:

```
database unavailable  ≠  database empty
```

A failed write must never be represented as a successful write of zero records.

## Retry policy

Retries are allowed only for transient failures:

- interrupted Netlink dumps (`NLM_F_DUMP_INTR`)
- `EINTR`
- temporary `EAGAIN`
- SQLite `SQLITE_BUSY`
- service dependency startup races

All retries must have:

- a maximum attempt count
- a maximum total duration
- a bounded delay
- a final failure state

Malformed input, invalid configuration, permission failures, and unsupported
operations must not be retried indefinitely.

## Restart policy

The service supervisor (procd) may restart a failed worker, but restart loops
must be bounded by the respawn threshold and timeout configured in the init
script. After repeated failures the service enters degraded mode and waits for
a longer recovery interval.

A restart must not erase:

- the last valid diagnostic result
- the failure category
- the number of consecutive failures
- the last successful collection time

## Data-retention failure

When storage is full:

1. Stop admitting new historical records.
2. Retain the latest valid snapshot in memory.
3. Attempt bounded retention cleanup only if explicitly configured.
4. Never delete database or journal files directly.
5. Expose `storage_full` to the API and logs.
6. Resume persistence only after a successful write probe.

## Security failure handling

Security-sensitive failures must fail closed:

- Invalid authorization → deny
- Malformed input → reject
- Unknown endpoint → reject (404, not 500)
- Missing TLS identity → reject secure request
- Command argument outside allowlist → reject before invocation
- Unsupported configuration operation → reject
- Excessive resource request → reject before allocation

## Observability requirements

Each failure event must include:

- stable component identifier
- stable failure category
- operation name
- source or interface name, if applicable
- retry count
- whether the last valid result remains available
- recovery action
- redacted human-readable detail

Events must not include secrets, full request bodies, credentials, or
untrusted strings without length limits.

## Release gates

The v1.0 release is blocked if any of the following occur:

- malformed Netlink input can crash or overrun a parser
- a missing counter is reported as zero
- a storage failure terminates collection
- API requests can invoke configuration changes
- shell construction is used for utility fallback
- unauthenticated API access is enabled by default
- SQLite integrity failure is ignored
- a worker restart loop is unbounded
- unsupported kernel features are represented as successful measurements
