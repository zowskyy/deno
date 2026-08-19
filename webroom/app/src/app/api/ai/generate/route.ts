import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { generatePageFromPrompt, AiPageError } from "@/lib/aiPages";
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

  const body = (await request.json()) as { prompt?: string; displayName?: string };
  try {
    const document = await generatePageFromPrompt({
      prompt: body.prompt ?? "",
      displayName: body.displayName ?? user.handle,
    });
    return NextResponse.json({ ok: true, document });
  } catch (error) {
    if (error instanceof AiPageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
