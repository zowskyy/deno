// SPDX-License-Identifier: GPL-2.0-only
/*
 * sch_gp — build scaffold only.
 *
 * This module deliberately implements nothing. It exists to prove the
 * out-of-tree build works and to give the eventual qdisc a home. No
 * qdisc kind is registered, no Netlink handler is installed, and no
 * enqueue/dequeue/peek behavior exists. See README.md for the gate
 * sequence that must pass before any of that is added.
 */

#include <linux/module.h>

MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("sch_gp build scaffold (no qdisc functionality yet)");
MODULE_AUTHOR("gateway-probe project");
