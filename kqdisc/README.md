# kqdisc — sch_gp build scaffold

**Status: scaffold only. No scheduling, shaping, or AQM behavior is
implemented.** This directory exists to give the eventual `sch_gp` kernel
qdisc a build system and a home. It does not claim to be a working qdisc
and must not be treated as one.

## Scope

This scaffold currently provides:

- A loadable kernel module skeleton (`sch_gp.c`) that only declares
  `MODULE_LICENSE`, `MODULE_DESCRIPTION`, and `MODULE_AUTHOR`. It does
  **not** register a qdisc kind, define `struct Qdisc_ops`, or implement
  any Netlink handler.
- A versioned UAPI header (`include/uapi/linux/pkt_sched_gp.h`) defining
  `sch_gp`'s own attribute family — never a reuse of CAKE's Netlink
  schema.
- An out-of-tree `Makefile`.

## Forbidden until gate B0 passes

None of the following may be added to this directory until gate B0 (see
below) is formally passed:

- Qdisc registration (`register_qdisc`, `struct Qdisc_ops`)
- `enqueue`/`dequeue`/`peek` implementations
- Any Netlink message handling (`rtnetlink`, `netlink`)
- Any AQM or scheduling algorithm

## Gate B0 — required before any functionality

- [ ] Pinned target-kernel headers documented
- [ ] UAPI document complete and reviewed (`docs/netlink-interface.md`)
- [ ] Concurrency model documented (locking, RCU, memory ordering)
- [ ] Memory budget analysis (per-queue, per-flow, per-device)
- [ ] License review (GPL-2.0-only confirmed)
- [ ] Threat model documented (malformed Netlink, privilege boundary,
      DoS vectors)

## Gate sequence

| Gate | Proof required |
|---|---|
| B0 | Design approval — see above |
| B1 | Module loads, registers `gp`, unloads; no kernel warnings or leaks |
| B2 | `tc qdisc add/change/show/del` works; malformed-Netlink negative tests pass |
| B3 | Loopback traffic passes without corruption, leak, deadlock, or unexpected loss |
| B4 | AQM algorithm unit tests pass on host; integration tests on target kernel |
| B5 | Controller can observe `gp` via own UAPI and switch target via config |
| B6 | 30+ days of Track A field data; benchmark comparisons; rollback plan; CPU/memory validation on target hardware |

"CAKE replacement" is not claimed until B6 passes.
