# UCI Configuration

**Sources**: K28, K29, O02, O06

## Overview

All gateway-probe configuration is held in the UCI package `gateway-probe`
at `/etc/config/gateway-probe`. The daemon reads UCI on startup and on
reload (via the procd config-change trigger). It never writes raw config
files directly.

## Data model

UCI organizes configuration in four levels:

| Level | UCI term | Example |
|---|---|---|
| File | Package | `/etc/config/gateway-probe` |
| Block | Section | `config probe 'main'` |
| Key-value | Option | `option interval '60'` |
| Multi-value | List | `list interface 'eth0'` |

Sections may be named (`'main'`) or anonymous (auto-named `cfg…`). The
daemon must handle both. Anonymous section names are internal identifiers
and must not be exposed to users.

## Reading configuration

The daemon must use the `uci` CLI or libuci, not direct file parsing.
Every option must be:

1. Read by its full path (`package.section.option`).
2. Type-checked (string, integer, boolean, list) before use.
3. Range- or allowlist-checked where applicable.
4. Treated as invalid and logged if the check fails.

On any validation failure the previous valid configuration is preserved.
The daemon must never apply a partially-read configuration.

## Staged changes

UCI stages writes to `/tmp/.uci/` before a `uci commit`. A `uci get`
after a set but before a commit returns the staged (uncommitted) value.
The daemon should read configuration only after a confirmed commit, which
the procd config-change trigger ensures when `service_triggers` is
correctly registered.

## Required options

```
config probe 'main'
    option enabled '1'          # boolean: 0 or 1
    option interval '60'        # integer: seconds between collections, min 10
    option db_max_pages '4096'  # integer: SQLite max_page_count
    list interface 'eth0'       # list: interfaces to monitor (must exist)
```

## Validation rules

| Option | Type | Constraint |
|---|---|---|
| `enabled` | boolean | must be 0 or 1 |
| `interval` | integer | must be ≥ 10 and ≤ 3600 |
| `db_max_pages` | integer | must be ≥ 100 and ≤ 1048576 |
| `interface` | list of strings | each entry must match `^[a-zA-Z0-9._-]{1,15}$` |

An option that fails validation is rejected; the previous value is kept.
An option that is absent uses the documented safe default.

## ubus interface (future, K29)

v1.0 does not expose a ubus interface. If added in a later phase:

- The ubus object must be read-only (no configuration-changing methods).
- All method arguments must be validated against the declared type before
  dispatch.
- Errors must be returned as `UBUS_STATUS_INVALID_ARGUMENT` (3) or
  `UBUS_STATUS_PERMISSION_DENIED` (6), not as crashes.
- The object must be registered only after the daemon is fully initialized.

ubus transport is Unix socket with TLV messages. The libubus API is the
correct integration point; do not parse raw TLV manually.
