/* SPDX-License-Identifier: GPL-2.0-only */
/*
 * Syntax check only: confirms the UAPI header is valid, self-contained
 * C and that its enum values are the expected ones. Does not touch the
 * kernel build; compiled with the host toolchain.
 */

#include "../include/uapi/linux/pkt_sched_gp.h"
#include <assert.h>
#include <stdio.h>

int main(void)
{
	assert(GP_UAPI_MAJOR == 1);
	assert(GP_UAPI_MINOR == 0);
	assert(TCA_GP_UNSPEC == 0);
	assert(TCA_GP_MAX == __TCA_GP_MAX - 1);
	printf("uapi_header_check: OK\n");
	return 0;
}
