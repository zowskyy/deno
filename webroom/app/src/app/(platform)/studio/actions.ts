"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  discardDraft,
  exportPageData,
  importPageData,
  PageDocumentValidationError,
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

export interface StudioActionResult {
  ok?: boolean;
  error?: string;
  document?: PageDocument;
  exportJson?: string;
}

function revalidateOwnerPaths(handle: string) {
  revalidatePath("/studio");
  revalidatePath(`/@${handle}`);
}

export async function saveDraftAction(documentJson: string): Promise<StudioActionResult> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  try {
    const parsed = JSON.parse(documentJson) as unknown;
    const document = saveDraftDocument(viewer.id, parsed);
    revalidateOwnerPaths(viewer.handle);
    return { ok: true, document };
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
    const document = savePageDocument(viewer.id, parsed);
    discardDraft(viewer.id);
    revalidateOwnerPaths(viewer.handle);
    return { ok: true, document };
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
    const document = importPageData(viewer.id, json);
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
