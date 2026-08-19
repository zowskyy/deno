"use server";

import { authenticateBlockedForAppeal, InvalidCredentialsError, ValidationError } from "@/lib/auth";
import { AppealError, fileAppeal } from "@/lib/appeals";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";

export interface AppealState {
  error?: string;
  success?: string;
}

export async function appealAction(_prev: AppealState, formData: FormData): Promise<AppealState> {
  const handle = String(formData.get("handle") ?? "");
  const password = String(formData.get("password") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    const key = await rateLimitActorKey("appeal", null);
    checkRateLimit(`${key}:${handle.trim().toLowerCase()}`, 3);
    const user = authenticateBlockedForAppeal(handle, password);
    fileAppeal(user.id, reason);
  } catch (e) {
    if (e instanceof InvalidCredentialsError || e instanceof ValidationError) {
      return { error: e.message };
    }
    if (e instanceof AppealError) return { error: e.message };
    if (e instanceof RateLimitError) {
      return { error: "Too many appeal attempts. Wait a minute and try again." };
    }
    throw e;
  }

  return {
    success:
      "Your appeal was submitted. Moderators review appeals in order — you'll be able to log in again if it's granted.",
  };
}
