"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { findUserByHandle } from "@/lib/auth";
import {
  acceptFriendRequest,
  FriendLinkNotFoundError,
  FriendRequestError,
  removeFriendLink,
  unblockUser,
} from "@/lib/friends";
import { GuestbookError, moderateGuestbookEntry } from "@/lib/guestbook";
import { activatePanicMode, getPageDocument } from "@/lib/pageDocument";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface SettingsActionState {
  error?: string;
}

export async function unblockUserAction(blockedUserId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");
  unblockUser(viewer.id, blockedUserId);
  revalidatePath("/settings");
}

export async function unblockAction(handle: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) return;

  const target = findUserByHandle(handle);
  if (!target) return;

  unblockUser(viewer.id, target.id);
  revalidatePath("/settings");
}

export async function acceptIncomingAction(requestId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) return;

  try {
    const key = await rateLimitActorKey("friend", viewer.id);
    checkRateLimit(key, 10);
    acceptFriendRequest(viewer.id, requestId);
    revalidatePath("/settings");
  } catch (e) {
    if (e instanceof FriendRequestError || e instanceof FriendLinkNotFoundError) return;
    if (e instanceof RateLimitError) return;
    throw e;
  }
}

export async function declineIncomingAction(requestId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) return;

  try {
    const key = await rateLimitActorKey("friend", viewer.id);
    checkRateLimit(key, 10);
    removeFriendLink(viewer.id, requestId);
    revalidatePath("/settings");
  } catch (e) {
    if (e instanceof FriendRequestError) return;
    if (e instanceof RateLimitError) return;
    throw e;
  }
}

export async function approveGuestbookAction(entryId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) return;

  try {
    moderateGuestbookEntry(viewer.id, entryId, true);
    revalidatePath("/settings");
    revalidatePath(`/@${viewer.handle}`);
  } catch (e) {
    if (e instanceof GuestbookError) return;
    throw e;
  }
}

export async function rejectGuestbookAction(entryId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) return;

  try {
    moderateGuestbookEntry(viewer.id, entryId, false);
    revalidatePath("/settings");
  } catch (e) {
    if (e instanceof GuestbookError) return;
    throw e;
  }
}

export async function panicModeAction(): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  const stored = getPageDocument(viewer.id);
  if (!stored) redirect("/make");

  activatePanicMode(viewer.id);
  revalidatePath("/settings");
  revalidatePath(`/@${viewer.handle}`);
}
