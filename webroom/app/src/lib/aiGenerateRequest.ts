/** Parsed AI generate request fields. */
export interface AiGenerateRequest {
  prompt: string;
  displayName?: string;
}

/** Parse and validate the AI generate request body. */
export function parseAiGenerateRequest(
  parsed: unknown,
): { ok: true; body: AiGenerateRequest } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const body = parsed as { prompt?: unknown; displayName?: unknown };
  if (body.prompt !== undefined && typeof body.prompt !== "string") {
    return { ok: false, error: "Prompt and display name must be strings." };
  }
  if (body.displayName !== undefined && typeof body.displayName !== "string") {
    return { ok: false, error: "Prompt and display name must be strings." };
  }
  return { ok: true, body: { prompt: body.prompt ?? "", displayName: body.displayName } };
}
