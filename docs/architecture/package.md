# Package Architecture

**Sources**: K24, K23, O04

## Package Makefile requirements

The gateway-probe OpenWrt package Makefile must include:

| Field | Requirement |
|---|---|
| `PKG_SOURCE_URL` | HTTPS URL to a fixed release archive |
| `PKG_SOURCE_VERSION` | Exact version tag or commit |
| `PKG_HASH` | SHA-256 or SHA-512 of the source archive |
| `PKG_MAINTAINER` | Email address |
| `PKG_LICENSE` | SPDX identifier (e.g. `GPL-2.0-or-later`) |
| `PKG_LICENSE_FILES` | Path(s) to license file(s) in the source |
| `PKG_RELEASE` | Increment on any package content or build change |
| `DEPENDS` | All runtime dependencies declared explicitly |

`PKG_RELEASE` must change whenever the package contents or build behavior
changes, even if the upstream version is unchanged.

## Source version policy

The package must use a fixed, hash-verified source archive. A moving `latest`
URL or branch head is not permitted. The archive URL must use HTTPS.

## Dependency policy

Runtime dependencies must come from:

1. OpenWrt core packages
2. The same package feed as gateway-probe

Dependencies from external or unmaintained feeds must be explicitly justified
and audited. A missing optional dependency must produce a documented
capability absence at runtime, not a missing symbol at link time.

Optional features that require a kernel module (kmod) must be declared as
conditional dependencies and must degrade gracefully when the module is absent.

## Build profiles

| Profile | Compiler flags | Purpose |
|---|---|---|
| Release | `-O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2` | Package build (cross-compiled) |
| Debug | `-g -fsanitize=address,undefined` | Host-side CI unit tests |
| Fuzz | `-fsanitize=address,fuzzer` | Fuzz targets (host only) |
| Coverage | `--coverage` | Coverage measurement (host only) |

Sanitizer builds are host-only. The cross-compile toolchain may not support
all sanitizer options and must not be required to.

## Reproducibility (K23)

All package builds must set `SOURCE_DATE_EPOCH` to the source archive
modification timestamp. Any build artifact that embeds a timestamp must
derive it from `SOURCE_DATE_EPOCH`.

The CI reproducibility check:

1. Build the package in directory A.
2. Build the package identically in directory B with a different absolute path.
3. Compare resulting archives byte-for-byte.
4. Any difference fails the gate.

## Package CI checks

Based on OpenWrt package guidelines (K24), the CI must verify:

- package builds without errors for all declared architectures
- installed binaries are executable
- no build paths are embedded in installed binaries
- binaries are stripped (unless debug symbols are explicitly required)
- shared library dependencies are declared and available
- SONAME is correct if a shared library is produced
- QEMU runtime test passes for at least one supported architecture

## Package tests

The package must include a test entry point compatible with OpenWrt's
generic package test infrastructure. The test must:

- verify the installed binary is present and executable
- verify the expected version string
- verify that `--help` (or equivalent) exits 0
- verify that the init script registers with procd

Runtime tests must be executable in a QEMU environment for CI.

## Supported architectures

The initial supported set:

| Architecture | Target | Notes |
|---|---|---|
| x86_64 | x86/64 | Primary development target |
| MIPS 24Kc | ath79 | Common home router SoC |
| ARM Cortex-A7 | ipq40xx | Common home router SoC |

Any architecture not in this list must produce a documented "not tested"
state, not a broken binary.
