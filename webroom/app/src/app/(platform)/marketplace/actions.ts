"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { installMarketplacePlugin } from "@/lib/plugins";

export async function installPluginAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const slug = String(formData.get("slug") ?? "");
  installMarketplacePlugin(user.id, slug);
  revalidatePath("/marketplace");
  revalidatePath("/studio");
}
