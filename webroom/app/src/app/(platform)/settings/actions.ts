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

export async function unblockAction(handle: string): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Log in to manage blocks." };

  const target = findUserByHandle(handle);
  if (!target) return { error: "That user doesn't exist." };

  unblockUser(viewer.id, target.id);
  revalidatePath("/settings");
  return {};
}

export async function acceptIncomingAction(requestId: string): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Log in to manage friend requests." };

  try {
    acceptFriendRequest(viewer.id, requestId);
    revalidatePath("/settings");
  } catch (e) {
    if (e instanceof FriendRequestError || e instanceof FriendLinkNotFoundError) return { error: e.message };
    throw e;
  }
  return {};
}

export async function declineIncomingAction(requestId: string): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Log in to manage friend requests." };

  try {
    removeFriendLink(viewer.id, requestId);
    revalidatePath("/settings");
  } catch (e) {
    if (e instanceof FriendRequestError) return { error: e.message };
    throw e;
  }
  return {};
}

export async function approveGuestbookAction(entryId: string): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Log in to moderate guestbook entries." };

  try {
    moderateGuestbookEntry(viewer.id, entryId, true);
    revalidatePath("/settings");
    revalidatePath(`/@${viewer.handle}`);
  } catch (e) {
    if (e instanceof GuestbookError) return { error: e.message };
    throw e;
  }
  return {};
}

export async function rejectGuestbookAction(entryId: string): Promise<SettingsActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Log in to moderate guestbook entries." };

  try {
    moderateGuestbookEntry(viewer.id, entryId, false);
    revalidatePath("/settings");
  } catch (e) {
    if (e instanceof GuestbookError) return { error: e.message };
    throw e;
  }
  return {};
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
