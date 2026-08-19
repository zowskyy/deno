"use server";

import { redirect } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import { GuestbookError, signGuestbook } from "@/lib/guestbook";
import { getPageDocument } from "@/lib/pageDocument";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface GuestbookState {
  error?: string;
}

export async function signGuestbookAction(
  handle: string,
  _prevState: GuestbookState,
  formData: FormData,
): Promise<GuestbookState> {
  const message = String(formData.get("message") ?? "");
  const viewer = await getCurrentUser();

  const owner = findUserByHandle(handle);
  if (!owner) return { error: "This page isn't available." };

  const stored = getPageDocument(owner.id);
  if (!stored?.isPublished || stored.guestbookDisabled || !stored.document.guestbook.enabled) {
    return { error: "The guestbook isn't open right now." };
  }

  try {
    const key = await rateLimitActorKey("guestbook", viewer?.id ?? null);
    checkRateLimit(key, 10);
    signGuestbook(
      owner.id,
      viewer?.id ?? null,
      viewer?.handle ?? null,
      message,
      stored.document.guestbook.requireApproval,
    );
  } catch (e) {
    if (e instanceof GuestbookError) return { error: e.message };
    if (e instanceof RateLimitError) return { error: e.message };
    throw e;
  }

  redirect(`/@${handle}?guestbook=signed`);
}
