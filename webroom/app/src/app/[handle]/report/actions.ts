"use server";

import { redirect } from "next/navigation";
import { fileReport, InvalidReportError } from "@/lib/reports";
import { getCurrentUser } from "@/lib/session";

export interface ReportState {
  error?: string;
}

export async function reportAction(handle: string, _prevState: ReportState, formData: FormData): Promise<ReportState> {
  const reason = String(formData.get("reason") ?? "");
  const viewer = await getCurrentUser();

  try {
    fileReport(viewer?.id ?? null, handle, reason);
  } catch (e) {
    if (e instanceof InvalidReportError) return { error: e.message };
    throw e;
  }

  redirect(`/@${handle}/report/sent`);
}
