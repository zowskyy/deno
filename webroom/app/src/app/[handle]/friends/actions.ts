"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import {
  acceptFriendRequest,
  FriendLinkNotFoundError,
  FriendRequestError,
  removeFriendLink,
  sendFriendRequest,
} from "@/lib/friends";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface FriendActionState {
  error?: string;
}

function handleFriendError(e: unknown): never | FriendActionState {
  if (e instanceof FriendRequestError) return { error: e.message };
  if (e instanceof FriendLinkNotFoundError) return { error: e.message };
  if (e instanceof RateLimitError) return { error: e.message };
  throw e;
}

export async function sendFriendRequestAction(handle: string): Promise<FriendActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/@${handle}`);

  const target = findUserByHandle(handle);
  if (!target) return { error: "This page isn't available." };
  if (target.id === viewer.id) return { error: "You can't friend yourself." };

  try {
    const key = await rateLimitActorKey("friend", viewer.id);
    checkRateLimit(key, 10);
    sendFriendRequest(viewer.id, target.id);
  } catch (e) {
    const result = handleFriendError(e);
    if (result) return result;
  }

  revalidatePath(`/@${handle}`);
  return {};
}

export async function acceptFriendRequestAction(handle: string, requestId: string): Promise<FriendActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/@${handle}`);

  try {
    const key = await rateLimitActorKey("friend", viewer.id);
    checkRateLimit(key, 10);
    acceptFriendRequest(viewer.id, requestId);
  } catch (e) {
    const result = handleFriendError(e);
    if (result) return result;
  }

  revalidatePath(`/@${handle}`);
  return {};
}

export async function declineFriendRequestAction(handle: string, requestId: string): Promise<FriendActionState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/@${handle}`);

  try {
    const key = await rateLimitActorKey("friend", viewer.id);
    checkRateLimit(key, 10);
    removeFriendLink(viewer.id, requestId);
  } catch (e) {
    const result = handleFriendError(e);
    if (result) return result;
  }

  revalidatePath(`/@${handle}`);
  return {};
}

export async function unfriendAction(handle: string, requestId: string): Promise<FriendActionState> {
  return declineFriendRequestAction(handle, requestId);
}
