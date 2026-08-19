import { describe, expect, it } from "vitest";
import { parseAiGenerateRequest } from "./aiGenerateRequest";

describe("parseAiGenerateRequest", () => {
  it("rejects null bodies", () => {
    const result = parseAiGenerateRequest(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("JSON object");
  });

  it("rejects non-string prompt fields", () => {
    const result = parseAiGenerateRequest({ prompt: 42 });
    expect(result.ok).toBe(false);
  });

  it("accepts valid prompt objects", () => {
    const result = parseAiGenerateRequest({ prompt: "dark neon shrine", displayName: "Void" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.prompt).toBe("dark neon shrine");
      expect(result.body.displayName).toBe("Void");
    }
  });
});
