"use server";

import { redirect } from "next/navigation";
import { authenticate, InvalidCredentialsError } from "@/lib/auth";
import { logIn } from "@/lib/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const handle = String(formData.get("handle") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const user = authenticate(handle, password);
    await logIn(user.id);
  } catch (e) {
    if (e instanceof InvalidCredentialsError) {
      return { error: e.message };
    }
    throw e;
  }

  redirect("/make");
}
