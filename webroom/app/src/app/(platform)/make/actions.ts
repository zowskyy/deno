"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  CURRENT_SCHEMA_VERSION,
  PageDocumentValidationError,
  savePageDocument,
  setPublished,
  setVisibility,
  type PageDocument,
  type TemplateId,
} from "@/lib/pageDocument";

export interface MakeState {
  error?: string;
}

const TEMPLATE_ACCENTS: Record<TemplateId, { accent: string; background: string }> = {
  "soft-web": { accent: "#e0526b", background: "#f6ecec" },
  "pixel-tavern": { accent: "#c7314b", background: "#241b2e" },
  "chrome-angel": { accent: "#ff4db8", background: "#160a23" },
  "dark-zine": { accent: "#f1eaee", background: "#0e0e0e" },
  "clean-portfolio": { accent: "#2563eb", background: "#ffffff" },
  "start-simple": { accent: "#e0526b", background: "#f1ede9" },
};

export async function makeFlowAction(_prevState: MakeState, formData: FormData): Promise<MakeState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/make");

  const template = String(formData.get("template") ?? "start-simple") as TemplateId;
  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const selectedParts = formData.getAll("pageParts").map(String);

  if (!displayName) {
    return { error: "Give your page a name." };
  }
  if (!(template in TEMPLATE_ACCENTS)) {
    return { error: "Pick one of the listed feelings." };
  }

  const colors = TEMPLATE_ACCENTS[template];
  const document: PageDocument = {
    version: CURRENT_SCHEMA_VERSION,
    identity: { displayName, bio },
    theme: { template, accent: colors.accent, background: colors.background, density: "comfortable" },
    // Order matters here — it's the render order on the published page.
    pageParts: ["identity", ...selectedParts.filter((p) => p !== "identity")] as PageDocument["pageParts"],
    links: [],
    now: "",
  };

  try {
    savePageDocument(viewer.id, document);
  } catch (e) {
    if (e instanceof PageDocumentValidationError) {
      return { error: "Something on that page wasn't quite right — try again." };
    }
    throw e;
  }
  setPublished(viewer.id, true);
  // Phase 1 only exposes a single publish/unpublish toggle — the finer
  // private/unlisted/public distinction is Phase 3. Publishing now means
  // fully public, same as the visible behavior described for Phase 1.
  setVisibility(viewer.id, "public");

  redirect(`/@${viewer.handle}`);
}
