# Research Status

**Gate condition**: 50 distinct reviewed sources with citation-complete documentation
before any implementation claim is presented as complete.

## Current standing

| Category | Verified sources |
|---|---:|
| OpenWrt official documentation and policy | 12 |
| Linux Netlink and networking kernel docs | 15 |
| SQLite storage and durability | 3 |
| OWASP security guidance | 3 |
| HTTP/IETF standards | 1 |
| Testing and toolchain | 4 |
| Reproducible builds | 1 |
| iperf3 upstream | 2 |
| **Total verified** | **43** |
| Remaining to gate | **7** |

The full ledger is in `source-ledger.csv`. Each row is a verified source;
no source appears until it has been fetched and reviewed.

## Remaining required sources (7)

The next research pass should verify and add sources in these areas:

| Priority | Topic | Target source type |
|---|---|---|
| 1 | UCI parsing contract — libuci API | OpenWrt official source or docs |
| 2 | ubus object/method registration contract | OpenWrt official source or wiki |
| 3 | iproute2 tc Netlink interface in source | upstream iproute2 source or man pages |
| 4 | OpenWrt kernel module / kmod packaging | OpenWrt package feed guidelines |
| 5 | SQLite limits — max_page_count, page_size, resource control | SQLite official documentation |
| 6 | Linux seccomp filter documentation | kernel.org documentation |
| 7 | OpenWrt flash/storage constraints and JFFS2/overlay behavior | OpenWrt technical reference |

## Research rules

1. A source counts only after its content is fetched and a verified finding is recorded.
2. Sources blocked or returning unusable content are not counted.
3. OpenWrt wiki pages that redirect to unavailable content are not counted until re-fetched successfully.
4. No implementation code is generated until the 50-source gate is passed.
5. Architecture decisions already recorded may be used to guide implementation design, but not as a claim that implementation is complete.

## Authority levels used in the ledger

| Label | Meaning |
|---|---|
| official | Published by the authoritative body that owns the specification or project |
| official project source | Normative source code from the authoritative project |
| official project guidance | Policy or guidelines from the authoritative project |
| official upstream documentation | Documentation published by the upstream project maintainers |
| community authority | Widely adopted guidance from a recognized community body (OWASP, Reproducible Builds) |
