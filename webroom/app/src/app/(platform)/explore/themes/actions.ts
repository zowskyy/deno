"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateProfileCustomCss } from "@/lib/cssScope";
import { getPageDocument, savePageDocument } from "@/lib/pageDocument";
import {
  forkTheme,
  getSharedTheme,
  installThemeOnDocument,
  publishTheme,
  reportTheme,
} from "@/lib/sharedThemes";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/session";

export interface ThemeActionResult {
  ok?: boolean;
  error?: string;
  themeId?: string;
}

export interface ThemeReportState {
  error?: string;
  success?: string;
}

function revalidateThemePaths(themeId?: string) {
  revalidatePath("/explore/themes");
  if (themeId) revalidatePath(`/explore/themes/${themeId}`);
}

export async function installThemeAction(themeId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/explore/themes/${themeId}`);

  const theme = getSharedTheme(themeId);
  if (!theme) throw new Error("That theme no longer exists.");

  const stored = getPageDocument(viewer.id);
  if (!stored) throw new Error("Save a page first — head to Studio to get started.");

  const updated = installThemeOnDocument(stored.document, theme);
  savePageDocument(viewer.id, updated);
  revalidatePath("/studio");
  revalidatePath(`/@${viewer.handle}`);
  revalidateThemePaths(themeId);
}

export async function forkThemeAction(themeId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect(`/login?next=/explore/themes/${themeId}`);

  const source = getSharedTheme(themeId);
  if (!source) throw new Error("That theme no longer exists.");

  try {
    const key = await rateLimitActorKey("theme-fork", viewer.id);
    checkRateLimit(key, 10);
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    throw e;
  }

  const newId = forkTheme(viewer.id, viewer.handle, themeId);
  revalidateThemePaths(themeId);
  revalidateThemePaths(newId);
  redirect(`/explore/themes/${newId}`);
}

export async function reportThemeAction(
  themeId: string,
  _prevState: ThemeReportState,
  formData: FormData,
): Promise<ThemeReportState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Tell us what's wrong with this theme." };
  if (reason.length > 500) return { error: "Keep the report under 500 characters." };

  const theme = getSharedTheme(themeId);
  if (!theme) return { error: "That theme no longer exists." };

  const viewer = await getCurrentUser();

  try {
    const key = await rateLimitActorKey("theme-report", viewer?.id ?? null);
    checkRateLimit(key, 5);
    reportTheme(themeId, viewer?.id ?? null, reason);
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message };
    throw e;
  }

  return { success: "Thanks — your report was sent to moderators." };
}

export async function publishThemeAction(
  _prevState: ThemeActionResult,
  formData: FormData,
): Promise<ThemeActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/explore/themes");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const tagsRaw = String(formData.get("tags") ?? "").trim();

  if (!name || name.length > 80) return { error: "Give the theme a name (up to 80 characters)." };
  if (!description || description.length > 280) {
    return { error: "Add a short description (up to 280 characters)." };
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tags.length === 0) return { error: "Add at least one tag, comma-separated." };
  if (tags.length > 10) return { error: "Up to 10 tags, comma-separated." };

  const stored = getPageDocument(viewer.id);
  if (!stored) return { error: "Save a page first — head to Studio to get started." };

  const theme = stored.document.theme;
  if (theme.customCssEnabled && theme.customCss.trim()) {
    const cssCheck = validateProfileCustomCss(theme.customCss, viewer.handle);
    if (!cssCheck.ok) return { error: `Custom CSS blocked: ${cssCheck.error}` };
  }

  try {
    const key = await rateLimitActorKey("theme-publish", viewer.id);
    checkRateLimit(key, 5);
    const id = publishTheme(viewer.id, viewer.handle, name, description, tags, stored.document.theme);
    revalidateThemePaths(id);
    redirect(`/explore/themes/${id}`);
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message };
    throw e;
  }
}
