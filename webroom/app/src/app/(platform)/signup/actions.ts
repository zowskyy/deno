"use server";

import { redirect } from "next/navigation";
import { createUser, HandleTakenError, ValidationError } from "@/lib/auth";
import { defaultPageDocument, savePageDocument } from "@/lib/pageDocument";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { logIn } from "@/lib/session";

export interface SignupState {
  error?: string;
}

export async function signupAction(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const handle = String(formData.get("handle") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || handle;

  let userId: string;
  try {
    const key = await rateLimitActorKey("signup", null);
    checkRateLimit(key, 5);
    const user = createUser(handle, password);
    userId = user.id;
  } catch (e) {
    if (e instanceof ValidationError || e instanceof HandleTakenError) {
      return { error: e.message };
    }
    if (e instanceof RateLimitError) {
      return { error: "Too many sign-up attempts from this connection. Wait a minute and try again." };
    }
    throw e;
  }

  // A brand-new account gets a real, valid, unpublished starter page
  // immediately — never a null/undefined state that the rest of the app
  // has to special-case.
  savePageDocument(userId, defaultPageDocument(displayName));

  await logIn(userId);
  redirect("/make");
}
