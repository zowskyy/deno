# Testing Requirements

**Sources**: K16, K17, K22, K23, K24

## Philosophy

Every claim about system behavior needs a test that could have failed.
A test suite that only verifies the happy path is not evidence of quality.
The test suite must include deliberately adversarial cases.

## Test layers

| Layer | What it tests | Tools |
|---|---|---|
| Unit | Individual parsers, validators, collectors in isolation | Host-side C test runner or Deno test |
| Integration | Collector-to-Netlink, collector-to-SQLite, API-to-collector | Host-side with fixtures or QEMU |
| System | Full daemon lifecycle on OpenWrt or QEMU | QEMU / target hardware |
| Fuzzing | Parser robustness under malformed input | libFuzzer or AFL++ with sanitizers |
| Regression | Known failure cases that must not reappear | Checked-in fixture files |
| Reproducibility | Build output is deterministic | Two-build comparison |

## Unit test requirements

### Netlink parser

Required test cases:

- valid RTM_GETLINK response → correct field values
- valid RTM_GETQDISC response with CAKE → correct CAKE attributes
- valid RTM_GETQDISC response without CAKE → `cake_not_present`
- NLMSG_ERROR response → error category preserved, no crash
- NLMSG_DONE mid-dump → dump terminates correctly
- NLM_F_DUMP_INTR flag → retry triggered, bounded
- truncated message (length < NLMSG_HDRLEN) → rejected, `malformed`
- attribute length exceeds message → rejected, `malformed`
- nested attribute depth exceeds limit → rejected, `malformed`
- unknown attribute type → ignored without error
- missing optional CAKE attribute → `null` / `not_reported`, not `0`
- 32-bit and 64-bit counter variants → correct types preserved
- receive buffer contains multiple messages → all processed correctly

### Interface state

- admin-up, carrier-up, operstate-up → three independent fields all set
- admin-up, carrier-down → carrier field false, not "link down"
- admin-down → admin field false; carrier and operstate not inferred
- IFF_DORMANT set → dormant field true, reported separately

### SQLite

- interrupted write (simulated) → all-or-nothing recovery verified
- `SQLITE_BUSY` → retry bounded; final `persist_failed` state
- `SQLITE_FULL` → write refused; collection continues; `storage_full` reported
- `SQLITE_IOERR` → rollback; reconnect later; result preserved in memory
- integrity check after reopening a crashed database → pass or `storage_corrupt`
- misspelled pragma → detected and logged; not silently ignored
- read-only connection attempts write → rejected immediately

### Input validation

- UCI option missing → safe default used; `unavailable` logged
- UCI option wrong type → rejected; previous config preserved
- API path unknown → 404; no internal state exposed
- API method not in allowlist → 405
- API body exceeds limit → 413; body not parsed
- API rate limit exceeded → 429; no collection invoked
- interface name with path traversal characters → rejected before use as argument
- interface name not in known-interface allowlist → rejected

### iperf3 integration

- binary absent → `unavailable`; no crash
- binary version incompatible → explicit rejection; `unavailable`
- timeout → process killed; `timeout`; last valid result preserved
- malformed JSON output → `malformed`; previous result preserved
- partial JSON (process killed mid-output) → `malformed`
- server refused connection → `transport_error`
- output exceeds byte limit → truncated and rejected; `malformed`

## Integration test requirements

### Netlink integration (requires Linux host or QEMU)

- open rtnetlink socket, send RTM_GETLINK, receive valid response
- open rtnetlink socket, send RTM_GETQDISC, receive valid response
- resolve Generic Netlink family at runtime → family ID correct
- capability probe on a host without CAKE → `cake_attributes: false`
- dump consistency retry on interrupted dump

### SQLite integration

- full collection → persist → reopen → read back → values match
- crash simulation → reopen → integrity check → recovery state reported
- retention limit enforced → oldest records pruned when limit reached

### API integration

- GET /diagnostics → 200 with valid JSON schema
- GET /diagnostics → 503 when collector reports `unavailable`
- GET /unknown-path → 404
- POST /diagnostics → 405
- oversized request → 413
- rapid sequential requests → 429

## Fuzzing requirements (K22)

Fuzz targets:

- Netlink message parser: arbitrary byte input, bounded length
- tc JSON parser: arbitrary JSON input, bounded size
- iperf3 JSON parser: arbitrary JSON input, bounded size
- UCI value parser: arbitrary string input, bounded length
- API request parser: arbitrary HTTP request, bounded size

Each fuzz target must be compiled with AddressSanitizer and UBSan. A fuzz
run must complete without a crash, memory error, or undefined behavior for
any input up to the defined maximum size.

The fuzz targets are separate from the production build. The production build
uses release flags without sanitizer overhead.

## Compiler profiles (K22)

| Profile | Flags | Purpose |
|---|---|---|
| `debug` | `-g -fsanitize=address,undefined` | Development and CI unit tests |
| `fuzz` | `-fsanitize=address,fuzzer` | Fuzz-target builds |
| `coverage` | `--coverage -fprofile-arcs -ftest-coverage` | Coverage measurement |
| `release` | `-O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2` | Package build |

The cross-compile toolchain for OpenWrt targets may not support all sanitizer
options. Sanitizer builds run on the host; release builds cross-compile.

## Reproducibility (K23)

All package builds must set `SOURCE_DATE_EPOCH` to the source archive
timestamp. The reproducibility check is:

1. Build the package in directory A.
2. Build the package identically in directory B.
3. Compare the resulting archives byte-for-byte.
4. A difference fails the reproducibility gate.

Any build-time artifact that embeds a timestamp must derive it from
`SOURCE_DATE_EPOCH`.

## TAP output requirement (K17)

All automated tests must produce TAP-compatible output. Tests that require
unavailable kernel features must output `ok # SKIP <reason>`, not fail.
A skip is not a pass; the coverage gap must be noted in CI output.

## Compatibility matrix

The following combinations must be tested before v1.0 release:

| Kernel version | Architecture | CAKE present | Test result required |
|---|---|---|---|
| OpenWrt 23.05 | x86_64 | yes | full pass |
| OpenWrt 23.05 | MIPS (malta) QEMU | yes | full pass |
| OpenWrt 23.05 | ARM (virt) QEMU | no | graceful `cake_not_present` |
| OpenWrt 23.05 | x86_64 | no | graceful `cake_not_present` |

## Release gate — testing

The v1.0 release is blocked if any of the following are true:

- malformed Netlink input can crash or produce a memory error in the parser
- a missing counter is reported as `0` by any test
- the SQLite interrupted-write test does not demonstrate all-or-nothing recovery
- the fuzz target crashes on any input within the defined size bound
- the reproducibility check produces a difference between two builds
- any test produces a false pass by hiding a skip or a failure
- the compatibility matrix has untested cells
