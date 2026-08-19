import { describe, expect, it } from "vitest";
import { AiPageError, generatePageFromPrompt } from "./aiPages";

describe("generatePageFromPrompt", () => {
  it("generates a template page without an API key", async () => {
    const doc = await generatePageFromPrompt({
      displayName: "Test User",
      prompt: "A dark neon pixel art shrine with music playlist",
    });
    expect(doc.identity.displayName).toBe("Test User");
    expect(doc.pageParts).toContain("identity");
    expect(doc.tags.length).toBeGreaterThan(0);
  });

  it("rejects empty prompts", async () => {
    await expect(
      generatePageFromPrompt({ displayName: "X", prompt: "   " }),
    ).rejects.toThrow(AiPageError);
  });

  it("rejects overly long prompts", async () => {
    await expect(
      generatePageFromPrompt({ displayName: "X", prompt: "x".repeat(501) }),
    ).rejects.toThrow(AiPageError);
  });
});
