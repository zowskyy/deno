"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";
import { configureInstanceUrl, getInstanceUrl } from "@/lib/instance";
import { followRemoteProfile, listFederationFollows, FederationError } from "@/lib/federation";

export async function saveInstanceUrlAction(formData: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !isModerator(user.id)) return { error: "Moderators only." };

  try {
    configureInstanceUrl(String(formData.get("instanceUrl") ?? ""));
    revalidatePath("/instance");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid URL." };
  }
}

export async function followRemoteAction(formData: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    followRemoteProfile(user.id, String(formData.get("profileUrl") ?? ""));
    revalidatePath("/instance");
    return {};
  } catch (error) {
    if (error instanceof FederationError) return { error: error.message };
    throw error;
  }
}

export { getInstanceUrl, listFederationFollows };
