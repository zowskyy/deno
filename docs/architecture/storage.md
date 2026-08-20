# Storage Architecture

**Sources**: K09, K10, K11

## Constraints

Gateway-probe runs on OpenWrt devices with constrained flash storage. The
storage design must account for:

- limited total flash capacity
- write-cycle limits on NAND/NOR flash
- overlay filesystem behavior (JFFS2/SquashFS)
- potential for interrupted writes during power loss
- no persistent swap

## SQLite policy

### Journal mode selection

WAL (`journal_mode=WAL`) is not assumed to be appropriate for all targets.
On constrained flash storage the additional write amplification from
WAL checkpointing may be harmful.

The journal mode must be selected deliberately:

| Scenario | Recommended mode |
|---|---|
| Multiple concurrent readers needed | WAL |
| Single writer, write cycles are a concern | DELETE (rollback journaling) |
| Read-only inspection of existing database | MEMORY |
| Database unavailable | in-memory degraded mode |

The default for v1.0 is `DELETE` (rollback journaling) unless the target
platform has been verified to benefit from WAL.

### PRAGMAs

The following pragmas must be set explicitly on every connection. An
unknown or misspelled pragma must be detected and logged; it must not
silently have no effect.

```sql
PRAGMA query_only = ON;           -- read-only connections
PRAGMA synchronous = FULL;        -- crash-safe writes
PRAGMA journal_mode = DELETE;     -- default; see above
PRAGMA busy_timeout = 5000;       -- 5 s timeout for SQLITE_BUSY
PRAGMA hard_heap_limit = 8388608; -- 8 MiB heap cap
```

After recovery:

```sql
PRAGMA integrity_check;
```

### Transaction boundaries

Every write path must use an explicit transaction. There must be no
auto-commit writes to the database in the collection path.

Boundaries:

```
BEGIN IMMEDIATE;
  INSERT collection result
  INSERT per-field records
COMMIT;  -- or ROLLBACK on any SQLITE_* error
```

`SQLITE_BUSY`, `SQLITE_FULL`, and `SQLITE_IOERR` are treated as distinct
error categories. Each maps to a different storage state (see failure model).

### WAL/journal file handling

The application must never delete `-wal`, `-shm`, or rollback-journal files
manually. SQLite performs its own recovery when the database is reopened.
After reopening, an `integrity_check` must be run and its result recorded
before any new writes are attempted.

### Database size limits

The database must enforce a maximum page count:

```sql
PRAGMA max_page_count = <computed from configured retention limit>;
```

When storage is full (`SQLITE_FULL`), collection continues in memory. The
latest snapshot remains available through the API. No records are silently
dropped; the `storage_full` state is reported.

### Read-only connections

Any connection that is intended only to inspect stored results must set:

```sql
PRAGMA query_only = ON;
```

The v1.0 release has a single writer path. All other code paths use
read-only connections.

## Storage state transitions

```
unavailable ──► recovering ──► healthy
                                 │
                         write failure
                                 │
                    ┌────────────┴──────────────┐
                    ▼                           ▼
           degraded_write_failed          storage_full
                    │
              integrity fail
                    │
                    ▼
                corrupt
```

The service continues collecting and serving the last valid snapshot in
every degraded state. Persistence resumes only after a successful write probe.

## Retention policy

v1.0 default: retain the last N collection snapshots per interface, where N
is configurable and bounded. The bound prevents unbounded database growth.

Automatic retention cleanup is not attempted by default. If the storage limit
is reached, new records are refused and `storage_full` is reported. The user
must take explicit action (reconfigure the limit, restart, or clear history).

## Backup and export

v1.0 provides no automatic backup. The database file path is documented so
the user can copy it manually. No export API is included in v1.0.
