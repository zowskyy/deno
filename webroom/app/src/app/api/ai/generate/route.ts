import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { generatePageFromPrompt, AiPageError } from "@/lib/aiPages";
import { parseAiGenerateRequest } from "@/lib/aiGenerateRequest";
import { checkRateLimit, rateLimitActorKey } from "@/lib/rateLimit";

/** Generate a page document draft from a natural-language prompt. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in to use AI assist." }, { status: 401 });

  const key = await rateLimitActorKey("ai:generate", user.id);
  try {
    checkRateLimit(key, 10);
  } catch {
    return NextResponse.json({ error: "Too many AI requests. Try again shortly." }, { status: 429 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const body = parseAiGenerateRequest(parsed);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 });
  }

  try {
    const document = await generatePageFromPrompt({
      prompt: body.body.prompt,
      displayName: body.body.displayName ?? user.handle,
    });
    return NextResponse.json({ ok: true, document });
  } catch (error) {
    if (error instanceof AiPageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
