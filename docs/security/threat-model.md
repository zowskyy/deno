# Threat Model

**Sources**: K12, K13, K14, K15, K25

## Scope

This threat model covers the v1.0 read-only diagnostic daemon and its local
HTTP API. It does not cover the physical network or upstream internet access.

## Assets

| Asset | Sensitivity | Notes |
|---|---|---|
| Diagnostic data (link state, qdisc stats, measurements) | Low–Medium | Can reveal network configuration and capacity |
| Configuration (UCI options) | Low | Read-only in v1.0; no credentials stored |
| SQLite database | Low–Medium | Contains historical diagnostic snapshots |
| Kernel Netlink access | Low | Read-only GET/DUMP only; no write operations |
| iperf3 measurement process | Medium | External process; output must be sanitized |

## Threat actors

| Actor | Access | Capability |
|---|---|---|
| LAN client (trusted user) | LAN network access | Can reach the API on the router's LAN address |
| Compromised LAN device | LAN network access | May attempt unauthorized or abusive API access |
| Malicious browser page | Indirect via LAN user's browser | Can make cross-origin requests from the LAN user's device |
| Physical attacker | Console/SSH | Out of scope for v1.0 network API |
| Malicious UCI configuration | Local file system | Out of scope for v1.0; covered by config validation |

## Trust boundary

The LAN API is not implicitly trusted. A request that arrives from a private
address is not authorized by that fact alone. The threat model includes:

- a compromised LAN client attempting unauthorized access
- a malicious browser page making cross-origin API requests from the LAN
- excessive polling or oversized requests intended to consume resources
- unauthenticated access to diagnostic data

## v1.0 API baseline controls

```
read-only endpoints only
strict method allowlist (GET for diagnostic data)
strict path allowlist (known endpoints only)
bounded request body size
bounded response size
request timeout
per-client rate limit
no shell-backed endpoint parameters
no configuration-changing endpoint
explicit authorization decision (default: disabled)
```

If authentication is not yet implemented, the default is **disabled
exposure**, not unauthenticated LAN access. The API must be explicitly
enabled after the user configures authorization.

## HTTP parsing controls (K12)

The API implementation must:

- reject control characters in header field values
- impose local limits on header count and field sizes
- reject malformed or ambiguous request targets
- treat HTTP and HTTPS as distinct origins; do not accept HTTPS on an HTTP listener
- verify HTTPS certificates and host identity on any outbound request
- return a client error for requests that exceed local limits; do not silently truncate
- never recover silently from malformed security-sensitive input

HTTP error mapping:

| Condition | Status |
|---|---|
| Malformed request | 400 |
| Authentication required | 401 |
| Authenticated but unauthorized | 403 |
| Unknown endpoint | 404 |
| Unsupported method | 405 |
| Request too large | 413 |
| Rate limited | 429 |
| Internal failure | 500 |
| Diagnostic subsystem unavailable | 503 |

## Command injection prevention (K14)

The daemon must not construct shell commands at runtime. Every invocation
of an external utility must use a fixed executable path and a fixed argument
array. No user input, UCI value, interface name, or API parameter may be
interpolated into a command string.

If a utility must be invoked, the contract is:

```
allowed:   execv("/usr/sbin/tc", ["-j", "qdisc", "show", "dev", fixed_devname])
forbidden: system("tc -j qdisc show dev " + devname)
forbidden: popen("tc -j qdisc show dev " + devname, "r")
```

`fixed_devname` must be validated against an allowlist of known interface
names from the system before use as an argument.

## Input validation (K15)

Validation must occur at the trust boundary. All inputs are untrusted until
validated:

- UCI option values: type check, range check, allowlist where applicable
- API request paths: allowlist match only
- API query parameters: type check, size bound, allowlist
- Netlink messages: length check, alignment check, nesting-depth limit
- iperf3 JSON output: size limit, schema validation, version check
- tc JSON output: size limit, schema validation, known-kind check

Validation failures result in rejection and logging of the failure category.
The previous valid configuration or result is preserved.

## iperf3 process containment (K26, K27)

The iperf3 measurement process must be contained:

- fixed executable path
- fixed argument array (no user-controlled arguments without bounds)
- maximum process lifetime enforced by the runner (SIGKILL on timeout)
- maximum output bytes read from stdout
- output treated as untrusted until schema-validated
- version pinned and audited; incompatible versions explicitly rejected
- connection, receive, and send timeouts set via iperf3 flags

The diagnostic core must not depend on iperf3 being available. If the
binary is absent or the version is incompatible, the measurement result
is reported as `unavailable`.

## Cross-origin policy

The API must set an explicit `Access-Control-Allow-Origin` header. The
default should be restrictive (same-origin only). The header must not be
set to `*` unless explicitly configured.

## Release gates — security

The v1.0 release is blocked if any of the following are true:

- unauthenticated API access is enabled by default
- shell construction is used for any utility invocation
- any API endpoint can trigger a configuration change
- any UCI value or API parameter is passed without validation to a utility
- cross-origin requests are permitted without explicit configuration
- iperf3 process lifetime is not bounded by the runner
- Netlink GET/DUMP errors are suppressed to hide `EPERM`
