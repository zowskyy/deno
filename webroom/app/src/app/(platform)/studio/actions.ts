"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { validateProfileCustomCss } from "@/lib/cssScope";
import {
  discardDraft,
  exportPageData,
  getPageDocument,
  PageDocumentValidationError,
  parsePageDocument,
  publishDraft,
  restoreVersion,
  saveDraftDocument,
  savePageDocument,
  setGuestbookDisabled,
  setHiddenFromDiscovery,
  setPublished,
  setVisibility,
  VersionNotFoundError,
  type PageDocument,
  type StoredPage,
} from "@/lib/pageDocument";
import { getSharedTheme, installThemeOnDocument, publishTheme } from "@/lib/sharedThemes";

export interface StudioActionResult {
  ok?: boolean;
  error?: string;
  document?: PageDocument;
  exportJson?: string;
  themeId?: string;
}

function revalidateOwnerPaths(handle: string) {
  revalidatePath("/studio");
  revalidatePath(`/@${handle}`);
}

function validateDocumentCss(document: PageDocument, handle: string): string | null {
  if (!document.theme.customCssEnabled || !document.theme.customCss.trim()) return null;
  const result = validateProfileCustomCss(document.theme.customCss, handle);
  return result.ok ? null : `Custom CSS blocked: ${result.error}`;
}

export async function saveDraftAction(documentJson: string): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  try {
    const parsed = JSON.parse(documentJson) as unknown;
    const document = parsePageDocument(parsed);
    const cssError = validateDocumentCss(document, viewer.handle);
    if (cssError) return { error: cssError };
    const saved = saveDraftDocument(viewer.id, document);
    revalidateOwnerPaths(viewer.handle);
    return { ok: true, document: saved };
  } catch (e) {
    if (e instanceof PageDocumentValidationError) {
      return { error: e.issues.join("; ") };
    }
    if (e instanceof SyntaxError) {
      return { error: "Document data was not valid JSON." };
    }
    throw e;
  }
}

export async function saveAndPublishAction(documentJson: string): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  try {
    const parsed = JSON.parse(documentJson) as unknown;
    const document = parsePageDocument(parsed);
    const cssError = validateDocumentCss(document, viewer.handle);
    if (cssError) return { error: cssError };
    const saved = savePageDocument(viewer.id, document);
    discardDraft(viewer.id);
    revalidateOwnerPaths(viewer.handle);
    return { ok: true, document: saved };
  } catch (e) {
    if (e instanceof PageDocumentValidationError) {
      return { error: e.issues.join("; ") };
    }
    if (e instanceof SyntaxError) {
      return { error: "Document data was not valid JSON." };
    }
    throw e;
  }
}

export async function publishDraftAction(): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  const stored = getPageDocument(viewer.id);
  if (stored?.draftDocument) {
    const cssError = validateDocumentCss(stored.draftDocument, viewer.handle);
    if (cssError) return { error: cssError };
  }

  try {
    const document = publishDraft(viewer.id);
    revalidateOwnerPaths(viewer.handle);
    return { ok: true, document };
  } catch (e) {
    if (e instanceof Error) {
      return { error: e.message };
    }
    throw e;
  }
}

export async function setPublishedAction(published: boolean): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  try {
    setPublished(viewer.id, published);
    revalidateOwnerPaths(viewer.handle);
    return { ok: true };
  } catch (e) {
    if (e instanceof Error) {
      return { error: e.message };
    }
    throw e;
  }
}

export async function setVisibilityAction(
  visibility: StoredPage["visibility"],
): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public") {
    return { error: "Pick private, unlisted, or public visibility." };
  }

  setVisibility(viewer.id, visibility);
  revalidateOwnerPaths(viewer.handle);
  return { ok: true };
}

export async function setHiddenFromDiscoveryAction(hidden: boolean): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  setHiddenFromDiscovery(viewer.id, hidden);
  revalidateOwnerPaths(viewer.handle);
  return { ok: true };
}

export async function setGuestbookDisabledAction(disabled: boolean): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  setGuestbookDisabled(viewer.id, disabled);
  revalidateOwnerPaths(viewer.handle);
  return { ok: true };
}

export async function restoreVersionAction(versionId: string): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  try {
    const document = restoreVersion(viewer.id, versionId);
    revalidateOwnerPaths(viewer.handle);
    return { ok: true, document };
  } catch (e) {
    if (e instanceof VersionNotFoundError) {
      return { error: "That version no longer exists." };
    }
    if (e instanceof PageDocumentValidationError) {
      return { error: e.issues.join("; ") };
    }
    throw e;
  }
}

export async function exportPageAction(): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  try {
    const exportJson = exportPageData(viewer.id);
    return { ok: true, exportJson };
  } catch (e) {
    if (e instanceof Error) {
      return { error: e.message };
    }
    throw e;
  }
}

export async function importPageAction(json: string): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { error: "Import file is not valid JSON." };
    }
    const obj = parsed as { document?: unknown };
    if (!obj.document) return { error: "Import file must contain a document field." };
    const document = parsePageDocument(obj.document);
    const cssError = validateDocumentCss(document, viewer.handle);
    if (cssError) return { error: cssError };
    savePageDocument(viewer.id, document);
    revalidateOwnerPaths(viewer.handle);
    return { ok: true, document };
  } catch (e) {
    if (e instanceof PageDocumentValidationError) {
      return { error: e.issues.join("; ") };
    }
    if (e instanceof Error) {
      return { error: e.message };
    }
    throw e;
  }
}

export async function publishThemeAction(
  name: string,
  description: string,
  tagsCsv: string,
): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Give your theme a name." };
  if (trimmedName.length > 80) return { error: "Theme name must be 80 characters or fewer." };

  const trimmedDescription = description.trim();
  if (trimmedDescription.length > 280) {
    return { error: "Theme description must be 280 characters or fewer." };
  }

  const tags = tagsCsv
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
  if (tags.some((t) => !/^[a-z0-9][a-z0-9-]*$/.test(t))) {
    return { error: "Tags must be lowercase letters, numbers, and hyphens." };
  }

  const stored = getPageDocument(viewer.id);
  if (!stored) return { error: "Publish a page before sharing a theme." };

  const working = stored.draftDocument ?? stored.document;
  const cssError = validateDocumentCss(working, viewer.handle);
  if (cssError) return { error: cssError };

  try {
    const themeId = publishTheme(
      viewer.id,
      viewer.handle,
      trimmedName,
      trimmedDescription,
      tags,
      working.theme,
    );
    revalidatePath("/explore/themes");
    return { ok: true, themeId };
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    throw e;
  }
}

export async function installThemeAction(themeId: string): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  const theme = getSharedTheme(themeId);
  if (!theme) return { error: "That theme is no longer available." };

  const stored = getPageDocument(viewer.id);
  if (!stored) return { error: "No page document to update." };

  const working = stored.draftDocument ?? stored.document;
  const document = installThemeOnDocument(working, theme);

  const cssError = validateDocumentCss(document, viewer.handle);
  if (cssError) return { error: cssError };

  const saved = saveDraftDocument(viewer.id, document);
  revalidateOwnerPaths(viewer.handle);
  return { ok: true, document: saved };
}
