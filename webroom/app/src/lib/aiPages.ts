import { randomUUID } from "node:crypto";
import { defaultPageDocument, parsePageDocument, type PageDocument } from "./pageDocument";
import { CURRENT_SCHEMA_VERSION } from "./pageDocumentTypes";
import { applyCreativeSpark, type CreativeSparkId } from "./creativeSparks";

/** Error thrown when AI page generation fails. */
export class AiPageError extends Error {}

/** Options for generating a page from a natural-language prompt. */
export interface AiGenerateOptions {
  displayName: string;
  prompt: string;
  mood?: CreativeSparkId;
}

/**
 * Generate a page document from a prompt.
 * Uses WEBROOM_AI_API_KEY when set; otherwise applies deterministic template expansion.
 */
export async function generatePageFromPrompt(options: AiGenerateOptions): Promise<PageDocument> {
  const trimmed = options.prompt.trim();
  if (!trimmed) throw new AiPageError("Describe what you want your page to feel like.");
  if (trimmed.length > 500) throw new AiPageError("Keep your prompt under 500 characters.");

  const apiKey = process.env.WEBROOM_AI_API_KEY?.trim();
  if (apiKey) {
    try {
      return await generateWithLlm(apiKey, options);
    } catch {
      /* fall through to template mode */
    }
  }

  return generateFromTemplate(options);
}

/** Deterministic template-based page generation (no external API). */
function generateFromTemplate(options: AiGenerateOptions): PageDocument {
  let doc = defaultPageDocument(options.displayName);
  doc.identity.bio = trimmedBioFromPrompt(options.prompt);
  doc.now = options.prompt.slice(0, 280);
  doc.pageParts = ["identity", "now", "links", "guestbook", "badges"];

  const lower = options.prompt.toLowerCase();
  if (lower.includes("shrine") || lower.includes("fan")) {
    doc.pageParts.push("shrine");
    doc = applyCreativeSpark("add-shrine", doc);
  }
  if (lower.includes("pixel") || lower.includes("art")) {
    doc.pageParts.push("pixelArt");
    doc = applyCreativeSpark("pixel-doodle", doc);
  }
  if (lower.includes("music") || lower.includes("playlist")) {
    doc.pageParts.push("playlist");
  }
  if (lower.includes("gallery") || lower.includes("photo")) {
    doc.pageParts.push("gallery");
  }

  if (options.mood) {
    doc = applyCreativeSpark(options.mood, doc);
  } else if (lower.includes("dark") || lower.includes("neon")) {
    doc = applyCreativeSpark("surprise-colors", doc);
  }

  const tags = extractTagsFromPrompt(options.prompt);
  doc.tags = tags.slice(0, 10);

  return parsePageDocument(doc);
}

/** Optional LLM-backed generation when API key is configured. */
async function generateWithLlm(apiKey: string, options: AiGenerateOptions): Promise<PageDocument> {
  const base = defaultPageDocument(options.displayName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.WEBROOM_AI_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You generate Webroom page document JSON. Return only valid JSON matching the schema fields: identity.displayName, identity.bio, now, tags (array), pageParts (array). No markdown.",
          },
          {
            role: "user",
            content: `Display name: ${options.displayName}\nPrompt: ${options.prompt}\nBase: ${JSON.stringify({ identity: base.identity, now: "", tags: [], pageParts: base.pageParts })}`,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) throw new AiPageError("AI service unavailable.");
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new AiPageError("AI returned empty response.");

    const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return mergeAiPageResponse(base, parsed);
  } finally {
    clearTimeout(timeout);
  }
}

/** Merge LLM output into a base document, preserving protected fields. */
export function mergeAiPageResponse(base: PageDocument, parsed: Record<string, unknown>): PageDocument {
  const identity = parsed.identity;
  const mergedIdentity =
    identity && typeof identity === "object" && !Array.isArray(identity)
      ? { ...base.identity, ...(identity as Partial<PageDocument["identity"]>) }
      : base.identity;

  return parsePageDocument({
    ...base,
    version: CURRENT_SCHEMA_VERSION,
    identity: mergedIdentity,
    now: typeof parsed.now === "string" ? parsed.now : base.now,
    tags: Array.isArray(parsed.tags) ? parsed.tags : base.tags,
    pageParts: Array.isArray(parsed.pageParts) ? parsed.pageParts : base.pageParts,
  });
}

/** Derive a short bio from the user's prompt. */
function trimmedBioFromPrompt(prompt: string): string {
  return prompt.length > 280 ? `${prompt.slice(0, 277)}…` : prompt;
}

/** Extract hashtag-like tokens from a prompt as page tags. */
function extractTagsFromPrompt(prompt: string): string[] {
  const words = prompt.toLowerCase().match(/[a-z][a-z0-9-]{1,20}/g) ?? [];
  const stop = new Set(["the", "and", "for", "with", "page", "make", "want", "like", "my"]);
  return [...new Set(words.filter((w) => !stop.has(w) && w.length > 2))].slice(0, 5);
}

/** Create a new page document id for plugin instances. */
export function newPluginInstanceId(): string {
  return randomUUID();
}
