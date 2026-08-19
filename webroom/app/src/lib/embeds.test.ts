import { describe, expect, it } from "vitest";
import { isAllowlistedEmbedUrl, parseAllowlistedEmbed } from "./embeds";

describe("parseAllowlistedEmbed", () => {
  it("parses Spotify track URLs", () => {
    const result = parseAllowlistedEmbed("https://open.spotify.com/track/abc123XYZ");
    expect(result).toEqual({
      provider: "spotify",
      embedUrl: "https://open.spotify.com/embed/track/abc123XYZ",
    });
  });

  it("parses YouTube watch URLs", () => {
    const result = parseAllowlistedEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result?.provider).toBe("youtube");
    expect(result?.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("rejects non-https URLs", () => {
    expect(parseAllowlistedEmbed("http://open.spotify.com/track/abc")).toBeNull();
  });

  it("rejects arbitrary domains", () => {
    expect(parseAllowlistedEmbed("https://evil.example/embed")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseAllowlistedEmbed("not a url")).toBeNull();
  });
});

describe("isAllowlistedEmbedUrl", () => {
  it("returns true for allowlisted providers", () => {
    expect(isAllowlistedEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });
});
