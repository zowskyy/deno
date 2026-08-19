import { describe, expect, it } from "vitest";
import { AiPageError, generatePageFromPrompt, mergeAiPageResponse } from "./aiPages";
import { defaultPageDocument } from "./pageDocument";

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

describe("mergeAiPageResponse", () => {
  it("preserves protected fields from the base document", () => {
    const base = defaultPageDocument("Safe User");
    base.theme.accent = "#112233";
    base.links = [{ label: "Home", url: "https://example.com" }];
    base.plugins = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        pluginSlug: "quote-card",
        data: { quote: "hi", author: "me" },
      },
    ];

    const merged = mergeAiPageResponse(base, {
      identity: { displayName: "Hacked", bio: "new bio" },
      theme: { accent: "#ff0000" },
      links: [{ label: "evil", url: "https://evil.example" }],
      plugins: [],
      now: "updated now",
      tags: ["art"],
      pageParts: ["identity", "now"],
    });

    expect(merged.identity.displayName).toBe("Hacked");
    expect(merged.identity.bio).toBe("new bio");
    expect(merged.now).toBe("updated now");
    expect(merged.tags).toEqual(["art"]);
    expect(merged.theme.accent).toBe("#112233");
    expect(merged.links).toEqual(base.links);
    expect(merged.plugins).toEqual(base.plugins);
  });
});
