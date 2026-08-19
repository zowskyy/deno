import { describe, expect, it } from "vitest";
import { isAllowlistedEmbedUrl, isAllowlistedEmbed, parseAllowlistedEmbed } from "./embeds";

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

describe("isAllowlistedEmbed", () => {
  it("rejects mismatched provider URLs", () => {
    expect(
      isAllowlistedEmbed({
        provider: "spotify",
        embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      }),
    ).toBe(false);
  });

  it("accepts canonical Spotify embed URLs", () => {
    const embedUrl = "https://open.spotify.com/embed/track/abc123XYZ";
    expect(isAllowlistedEmbed({ provider: "spotify", embedUrl })).toBe(true);
    expect(parseAllowlistedEmbed(embedUrl)?.embedUrl).toBe(embedUrl);
  });

  it("accepts canonical YouTube embed URLs", () => {
    const embedUrl = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    expect(isAllowlistedEmbed({ provider: "youtube", embedUrl })).toBe(true);
  });

  it("rejects non-canonical YouTube watch URLs in stored embeds", () => {
    expect(
      isAllowlistedEmbed({
        provider: "youtube",
        embedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ).toBe(false);
  });
});
