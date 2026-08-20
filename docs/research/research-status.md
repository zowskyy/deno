# Research Status

**Gate condition**: 50 distinct reviewed sources with citation-complete documentation
before any implementation claim is presented as complete.

## Current standing

| Category | Verified sources |
|---|---:|
| OpenWrt official documentation and policy | 19 |
| Linux Netlink and networking kernel docs | 15 |
| SQLite storage and durability | 4 |
| OWASP security guidance | 3 |
| HTTP/IETF standards | 1 |
| Testing and toolchain | 4 |
| Reproducible builds | 1 |
| iperf3 upstream | 2 |
| Linux seccomp | 1 |
| **Total verified** | **50** |
| Remaining to gate | **0** |

**The 50-source research gate is passed.** Implementation may now begin, subject
to the architecture and test requirements recorded in `docs/architecture/` and
`docs/testing/`.

## Sources added in final pass (K28–K34)

| ID | Topic | Key finding |
|---|---|---|
| K28 | UCI Technical Reference | Package/section/option/list hierarchy; staged changes in /tmp/.uci; validate every option on read |
| K29 | ubus Technical Reference | Unix socket + TLV transport; UBUS_STATUS codes; JSON argument format; read-only design for v1.0 |
| K30 | SQLite Limits | sqlite3_limit runtime API; set conservative LENGTH/SQL_LENGTH/EXPR_DEPTH limits; max_page_count enforcement |
| K31 | Linux Seccomp Filter | PR_SET_NO_NEW_PRIVS required; architecture check in BPF before syscall number filter; complement not replacement |
| K32 | OpenWrt Flash Layout | JFFS2 overlay wiped on sysupgrade; treat missing database as first-run healthy state; prefer /etc/config for config |
| K33 | OpenWrt Kernel Module Packaging | KernelPackage macro; DEPENDS:=+kmod-<name>; probe at runtime; degrade gracefully when absent |
| K34 | tc man page — JSON and limits | -j/--json flag; 32-bit rate/time/size limits; use as bounded fallback with range validation |

## Implementation readiness

All gate requirements are now met:

- [x] 50 verified sources
- [x] Official/primary/secondary authority labels on every row
- [x] Inline citations and source IDs in architecture documents
- [x] OpenWrt packaging and procd lifecycle documented (K24, K25, K33, O03, O04)
- [x] UCI and ubus contracts documented (K28, K29, O06)
- [x] Netlink-first collection with fallbacks documented (K01–K07, K18–K21)
- [x] CAKE/SQM measurement behavior documented (K05, K21, O05, O09, O10)
- [x] SQLite durability policy documented (K09, K10, K11, K30)
- [x] HTTP/API security controls documented (K12, K13, K14, K15)
- [x] Threat model documented (docs/security/threat-model.md)
- [x] Failure-state taxonomy documented (docs/architecture/failure-model.md)
- [x] Regression and fuzzing requirements documented (docs/testing/requirements.md)
- [x] Compatibility and release gates documented across all architecture files

## Authority levels used in the ledger

| Label | Meaning |
|---|---|
| official | Published by the authoritative body that owns the specification or project |
| official project source | Normative source code from the authoritative project |
| official project guidance | Policy or guidelines from the authoritative project |
| official upstream documentation | Documentation published by the upstream project maintainers |
| community authority | Widely adopted guidance from a recognized community body (OWASP, Reproducible Builds) |

## Research rules

1. A source counts only after its content is fetched and a verified finding is recorded.
2. Sources blocked or returning unusable content are not counted.
3. No implementation code may claim to be complete unless the relevant architecture
   document cites a verified source and the test requirements for that claim are specified.
