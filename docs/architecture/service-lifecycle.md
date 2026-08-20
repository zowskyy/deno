# Service Lifecycle

**Sources**: K24, K25, O03

## procd integration

The gateway-probe diagnostic daemon is managed by OpenWrt's `procd` init
system. The init script must use the procd shell API exclusively; it must
not use SysV-style `start-stop-daemon` or raw background processes.

## Init script structure

```sh
#!/bin/sh /etc/rc.common

USE_PROCD=1
START=95
STOP=05

start_service() {
    procd_open_instance
    procd_set_param command /usr/sbin/gateway-probe-daemon
    procd_append_param command --config /etc/gateway-probe/config
    procd_set_param respawn 3600 5 5   # threshold, timeout, retry
    procd_set_param user nobody
    procd_set_param group nogroup
    procd_set_param limits core="0"
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}

service_triggers() {
    procd_add_reload_trigger "gateway-probe"
}
```

## Command argument policy

`procd_set_param command` stores arguments as an array. The diagnostic daemon
must not reconstruct a shell command from user-controlled strings at any
point. Every argument passed to a utility must come from a fixed allowlist.

## Respawn policy

The `respawn` parameters above mean:

- `threshold 3600`: if the service crashes more than the retry count within
  this many seconds, it is considered failed and procd stops restarting it.
- `timeout 5`: minimum wait between restarts (seconds).
- `retry 5`: maximum restarts within the threshold window.

After exhausting retries, the service is in a failed state. Logs must
preserve the failure category and the count of consecutive failures.

## Privilege policy

The daemon runs as `nobody:nogroup`. It must not request `CAP_NET_ADMIN`.
GET and DUMP Netlink operations do not require administrative capabilities
on current OpenWrt kernels.

If a future feature requires elevated privilege, it must be packaged as a
separate, explicitly privileged component, not by raising the daemon's
privilege level.

## Jail and isolation (future)

The procd shell API supports `jail`, `seccomp`, `no_new_privs`, and
filesystem/network namespace isolation. These must be evaluated before
enabling:

- Netlink sockets must remain accessible inside the jail.
- `/sys/class/net` and `/proc/net` paths must be accessible if sysfs/procfs
  fallbacks are used.
- UCI configuration path must be accessible.

A jail that blocks required paths converts a healthy service into a
permanently degraded one without a visible error. Jail configuration is
deferred to a post-v1.0 security hardening pass.

## Configuration triggers

The `service_triggers` function registers a reload trigger on the
`gateway-probe` UCI package. A UCI commit to that package causes procd
to send SIGHUP (or the configured signal) to the daemon. The daemon must:

1. Re-read and validate the updated UCI configuration.
2. If the configuration is valid, apply it and continue.
3. If invalid, preserve the previous valid configuration and log the failure.
4. Never restart the collection cycle to apply an invalid configuration.

## Startup sequence

```
1. procd starts the daemon
2. daemon opens Netlink socket(s)
3. daemon probes capabilities (record per-family availability)
4. daemon opens SQLite database (or enters non-persistent mode)
5. daemon starts first collection cycle
6. daemon begins serving the local HTTP API
```

Steps 3–4 must not block the start of collection. If SQLite fails to open,
collection continues immediately in non-persistent mode.

## Shutdown sequence

```
1. procd sends SIGTERM
2. daemon completes in-flight collection if within deadline (default: 5 s)
3. daemon flushes in-memory state to SQLite if available
4. daemon closes Netlink sockets and SQLite connection
5. daemon exits 0
```

If the deadline is exceeded, the daemon exits with a non-zero status.
procd will log the abnormal exit.
