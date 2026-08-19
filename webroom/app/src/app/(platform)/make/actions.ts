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
import { defaultPageDocumentFieldsV3 } from "@/lib/pageDocumentTypes";
import { TEMPLATE_PRESETS } from "@/lib/pageDocumentTheme";

export interface MakeState {
  error?: string;
}

export async function makeFlowAction(_prevState: MakeState, formData: FormData): Promise<MakeState> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/make");

  const template = String(formData.get("template") ?? "start-simple") as TemplateId;
  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const now = String(formData.get("now") ?? "").trim();
  const linkLabel = String(formData.get("linkLabel") ?? "").trim();
  const linkUrl = String(formData.get("linkUrl") ?? "").trim();
  const selectedParts = formData.getAll("pageParts").map(String);

  if (!displayName) {
    return { error: "Give your page a name." };
  }
  if (!(template in TEMPLATE_PRESETS)) {
    return { error: "Pick one of the listed feelings." };
  }

  const preset = TEMPLATE_PRESETS[template];
  const links: PageDocument["links"] = [];
  if (linkLabel && linkUrl) {
    links.push({ label: linkLabel, url: linkUrl });
  }

  const document: PageDocument = {
    version: CURRENT_SCHEMA_VERSION,
    identity: { displayName, bio },
    theme: {
      template,
      accent: preset.accent,
      background: preset.background,
      density: "comfortable",
      fontStyle: preset.fontStyle,
      reduceMotion: false,
      customCss: "",
      customCssEnabled: false,
      attribution: undefined,
    },
    pageParts: ["identity", ...selectedParts.filter((p) => p !== "identity")] as PageDocument["pageParts"],
    links,
    now,
    ...defaultPageDocumentFieldsV3(),
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
  setVisibility(viewer.id, "public");

  redirect(`/@${viewer.handle}`);
}
