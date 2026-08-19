"use server";

import { redirect } from "next/navigation";
import { authenticate, InvalidCredentialsError } from "@/lib/auth";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { logIn } from "@/lib/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const handle = String(formData.get("handle") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const key = await rateLimitActorKey("login", null);
    checkRateLimit(`${key}:${handle.trim().toLowerCase()}`, 10);
    const user = authenticate(handle, password);
    await logIn(user.id);
  } catch (e) {
    if (e instanceof InvalidCredentialsError) {
      return { error: e.message };
    }
    if (e instanceof RateLimitError) {
      return { error: "Too many login attempts. Wait a minute and try again." };
    }
    throw e;
  }

  redirect("/make");
}
