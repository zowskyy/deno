"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { findUserByHandle } from "@/lib/auth";
import {
  DirectMessageError,
  listConversations,
  listDirectMessagesForUser,
  markConversationRead,
  sendDirectMessage,
} from "@/lib/directMessages";

export async function sendMessageAction(formData: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const handle = String(formData.get("handle") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const recipient = findUserByHandle(handle);
  if (!recipient) return { error: "User not found." };

  try {
    await sendDirectMessage(user.id, recipient.id, body);
    revalidatePath("/messages");
    return {};
  } catch (error) {
    if (error instanceof DirectMessageError) return { error: error.message };
    throw error;
  }
}

export async function markReadAction(otherUserId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  markConversationRead(user.id, otherUserId);
  revalidatePath("/messages");
}

export { listConversations, listDirectMessagesForUser };
