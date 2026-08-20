/* SPDX-License-Identifier: GPL-2.0-only WITH Linux-syscall-note */
#ifndef __LINUX_PKT_SCHED_GP_H
#define __LINUX_PKT_SCHED_GP_H

/*
 * sch_gp UAPI — own attribute family, never a reuse of CAKE's Netlink
 * schema. This header is a design artifact only until gate B0 passes;
 * no code in this repository parses or emits these attributes yet.
 */

#define GP_UAPI_MAJOR 1
#define GP_UAPI_MINOR 0

enum {
	TCA_GP_UNSPEC,
	TCA_GP_VERSION,		/* u32 — ABI major.minor */
	TCA_GP_RATE_BPS,	/* u64 — ceiling in bit/s */
	TCA_GP_LATENCY_REFERENCE_US, /* u32 — AQM target delay */
	TCA_GP_FLAGS,		/* u32 — bitmask */
	TCA_GP_STATS,		/* nested stats */
	__TCA_GP_MAX
};
#define TCA_GP_MAX (__TCA_GP_MAX - 1)

#endif /* __LINUX_PKT_SCHED_GP_H */
