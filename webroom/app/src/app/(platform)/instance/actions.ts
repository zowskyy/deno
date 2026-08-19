"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";
import { configureInstanceUrl } from "@/lib/instance";
import { followRemoteProfile, FederationError } from "@/lib/federation";

export interface InstanceActionState {
  error?: string;
}

export async function saveInstanceUrlAction(
  _prev: InstanceActionState,
  formData: FormData,
): Promise<InstanceActionState> {
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

export async function followRemoteAction(
  _prev: InstanceActionState,
  formData: FormData,
): Promise<InstanceActionState> {
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
