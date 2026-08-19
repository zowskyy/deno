"use server";

import { redirect } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import { blockUser } from "@/lib/friends";
import { getCurrentUser } from "@/lib/session";

export async function blockAction(handle: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/@${handle}/block`);

  const target = findUserByHandle(handle);
  if (target) blockUser(viewer.id, target.id);

  // Redirecting back to the now-blocked page would just 404 the viewer
  // (blocked pages are hidden from the blocker too) — send them
  // somewhere that makes sense instead.
  redirect(`/@${handle}/block/done`);
}
