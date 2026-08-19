"use server";

import { revalidatePath } from "next/cache";
import { findUserByHandle } from "@/lib/auth";
import { GuestbookError, signGuestbook } from "@/lib/guestbook";
import { canViewPage, getPageDocument } from "@/lib/pageDocument";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface GuestbookState {
  error?: string;
  success?: string;
}

export type GuestbookActionState = GuestbookState;

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
  if (
    !stored ||
    !canViewPage(stored, owner.id, viewer?.id ?? null) ||
    stored.guestbookDisabled ||
    !stored.document.guestbook.enabled
  ) {
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

  const success = stored.document.guestbook.requireApproval
    ? "Thanks — your message is waiting for approval."
    : "Thanks — your message is on the guestbook.";
  revalidatePath(`/@${handle}`);
  return { success };
}
