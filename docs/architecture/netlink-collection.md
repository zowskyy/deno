# Netlink Collection Architecture

**Sources**: K01, K02, K03, K04, K05, K06, K07, K18, K19, K20, K21

## Overview

The diagnostic collector uses Netlink as the primary interface for all kernel
network state. Every collection operation has a defined fallback chain and an
explicit unavailable result type. No missing measurement is ever converted to
a zero value.

## Collector map

The network subsystem is split into independent collectors. A failure in one
must not terminate any other.

```
rtnetlink collectors:
  link       RTM_GETLINK  → link metadata, operational state, statistics
  route      RTM_GETROUTE → routing table entries
  neighbor   RTM_GETNEIGH → ARP/NDP neighbor cache
  qdisc      RTM_GETQDISC → qdisc kind, parent, handle, statistics

Generic Netlink collectors:
  ethtool    ETHTOOL_MSG_LINKS_GET, ETHTOOL_MSG_STATS_GET → link state, speed, duplex
```

### Fallback order (NETLINK-001)

```
Netlink
  → sysfs / procfs
    → controlled utility (fixed executable, fixed argument array)
      → explicit unavailable result
```

The fallback is taken only when the Netlink family or operation is absent or
returns `EOPNOTSUPP`. It is never taken silently.

## Message handling requirements

### Bounded message walker (K02)

Every message loop must:

- advance by `nlmsg_len` rounded up to `NLMSG_ALIGN`
- check `nlmsg_len >= NLMSG_HDRLEN` before reading
- stop when `nlmsg_len` exceeds remaining buffer
- handle `NLMSG_ERROR` before other message types
- handle `NLMSG_DONE` as the terminal condition for a dump
- track sequence numbers and reject out-of-sequence replies

### Attribute parser (K02, K03)

Every attribute loop must:

- check attribute length before reading
- reject any attribute whose length exceeds the enclosing message
- enforce a maximum nesting depth
- dispatch nested attributes by the enclosing kind/selector, not by a flat table
- treat unknown attribute types as ignorable, not as errors

### Dump consistency (NETLINK-003)

A dump that returns `NLM_F_DUMP_INTR` must be retried.

```
maximum attempts: 3
retry delay:      bounded exponential (suggested 50 ms, 100 ms, 200 ms)
final status:     partial or inconsistent
```

The collection result must include:

```json
{
  "collection": {
    "consistent": false,
    "attempts": 3,
    "status": "partial"
  }
}
```

### Truncation and size limits (NETLINK-007)

The parser must:

- reject any truncated message (length shorter than header claims)
- enforce a maximum single-message size
- enforce a maximum receive buffer size
- handle multiple messages in one `recv()` buffer by iterating, not by assuming one message per call
- avoid unbounded allocation; use fixed pre-allocated buffers where possible

### Extended acknowledgements (NETLINK-004)

Enable `NETLINK_EXT_ACK` on the socket. On error, preserve:

```json
{
  "error": {
    "errno": 95,
    "message": "operation not supported",
    "attribute_offset": null
  }
}
```

The kernel error string is diagnostic text only. It is not a stable machine-readable code.

## Capability detection (NETLINK-005)

At startup, probe each family and operation and record the result:

```json
{
  "capabilities": {
    "rtnetlink": true,
    "ethtool_netlink": true,
    "qdisc_dump": true,
    "cake_attributes": false,
    "interface_statistics": true
  }
}
```

Do not hard-code family IDs for Generic Netlink families (K04). Resolve them
at runtime using `CTRL_CMD_GETFAMILY`.

## No silent zero values (NETLINK-002)

A missing attribute must not become `0`.

Incorrect:
```json
{ "drops": 0 }
```

Correct when the kernel did not provide a drop counter:
```json
{
  "drops": null,
  "availability": "not_reported",
  "source": "rtnetlink"
}
```

## Read-only privileges (NETLINK-006)

The collector must use only GET and DUMP operations. It must not hold or
request `CAP_NET_ADMIN`. The diagnostic daemon should run under a dedicated
unprivileged user.

If any ethtool or rtnetlink operation returns `EPERM` or `EACCES`, the
collector marks that capability unavailable and continues. It must not
attempt privilege escalation.

## Interface state model (K19)

The three link-state flags must be represented as independent fields:

| Field | Source | Meaning |
|---|---|---|
| `admin_up` | `IFF_UP` | Interface is administratively enabled |
| `carrier` | `IFF_RUNNING` / `IFF_LOWER_UP` | Physical or lower-layer carrier is present |
| `dormant` | `IFF_DORMANT` | Interface is waiting for a higher-level condition |
| `operstate` | `IFLA_OPERSTATE` | Kernel-synthesized operational state |

A link that is admin-up but carrier-down must not be reported as simply "down".
The report must preserve all four values.

## CAKE and qdisc inspection (K21)

Priority order:

```
1. traffic-control Netlink dump (RTM_GETQDISC)
2. decode generic qdisc statistics (K05)
3. identify qdisc kind from TCA_KIND
4. decode CAKE-specific nested attributes when kind == "cake"
5. use `tc -j qdisc show` only as a bounded fallback
```

CAKE status must be one of:

```
cake_not_present
cake_present_no_optional_stats
cake_present_stats_complete
qdisc_present_unknown_kind
qdisc_query_unsupported
qdisc_parse_error
```

CAKE optional attributes that are absent must produce:

```json
{
  "value": null,
  "availability": "not_reported"
}
```

Never:

```json
{
  "value": 0,
  "availability": "present"
}
```

## Collection result contract

Every collection result must include:

```json
{
  "timestamp_utc": "...",
  "monotonic_duration_ms": 42,
  "source": "rtnetlink",
  "consistent": true,
  "capabilities": { "...": true },
  "fields": {
    "example_counter": {
      "value": 1234,
      "availability": "present",
      "source": "rtnetlink"
    }
  },
  "failure": null
}
```

A failed collection result:

```json
{
  "timestamp_utc": "...",
  "monotonic_duration_ms": 5,
  "source": "rtnetlink",
  "consistent": false,
  "failure": {
    "category": "transport_error",
    "operation": "RTM_GETQDISC",
    "attempts": 1,
    "detail": "socket creation failed: ENOMEM"
  }
}
```
