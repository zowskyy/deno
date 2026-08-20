import { describe, expect, it } from "vitest";
import { scopeProfileCss, profileScopeClass, validateProfileCustomCss } from "./cssScope";

describe("scopeProfileCss", () => {
  it("scopes a simple rule to the profile container", () => {
    const result = scopeProfileCss(".bio { color: red; }", ".profile-scope--void");
    expect(result.rejected).toHaveLength(0);
    expect(result.css).toContain(".profile-scope--void .bio");
  });

  it("rejects @import", () => {
    const result = scopeProfileCss('@import url("evil.css");', ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.css).toBe("");
  });

  it("rejects javascript: URLs", () => {
    const result = scopeProfileCss('a { background: url(javascript:alert(1)); }', ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("rejects body selector", () => {
    const result = scopeProfileCss("body { display: none; }", ".profile-scope--x");
    expect(result.rejected.some((r) => r.includes("body"))).toBe(true);
  });

  it("rejects HTML tags in CSS", () => {
    const result = scopeProfileCss("</style><script>alert(1)</script>", ".profile-scope--x");
    expect(result.rejected.some((r) => r.includes("HTML"))).toBe(true);
    expect(result.css).toBe("");
  });

  it("rejects absolute overlays with z-index", () => {
    const result = scopeProfileCss(".trap { position: absolute; z-index: 9999; }", ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("rejects position and z-index split across separate rules", () => {
    const result = scopeProfileCss(
      ".trap { position: absolute; } .trap { z-index: 9999; }",
      ".profile-scope--x",
    );
    expect(result.rejected.some((r) => r.includes("position"))).toBe(true);
    expect(result.css).toBe("");
  });

  it("rejects overlays inside @media rules", () => {
    const result = scopeProfileCss(
      "@media screen { .trap { position: fixed; z-index: 9999; inset: 0; } }",
      ".profile-scope--x",
    );
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.css).toBe("");
  });

  it("rejects comment-obfuscated overlay declarations", () => {
    const result = scopeProfileCss(".trap { position/**/: absolute; z-index: 9999; }", ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.css).toBe("");
  });

  it("rejects escaped overlay declarations", () => {
    const result = scopeProfileCss(".trap { pos\\69tion: absolute; z\\2d index: 9999; }", ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.css).toBe("");
  });

  it("rejects escaped blocked tokens", () => {
    const result = scopeProfileCss('@\\69mport url("evil.css");', ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.css).toBe("");
  });

  it("rejects quoted javascript: and data: values inside url()", () => {
    const jsResult = scopeProfileCss('a { background: url("javascript:alert(1)"); }', ".profile-scope--x");
    expect(jsResult.rejected.length).toBeGreaterThan(0);
    expect(jsResult.css).toBe("");

    const dataResult = scopeProfileCss("a { background: url('data:text/html,evil'); }", ".profile-scope--x");
    expect(dataResult.rejected.length).toBeGreaterThan(0);
    expect(dataResult.css).toBe("");
  });

  it("allows javascript: inside quoted content strings", () => {
    const result = scopeProfileCss(
      '.x { content: "/* not a comment */ javascript:alert(1)"; color: red; }',
      ".profile-scope--x",
    );
    expect(result.rejected).toHaveLength(0);
    expect(result.css).toContain("content:");
  });

  it("rejects position via custom property", () => {
    const result = scopeProfileCss(
      ":root { --overlay: fixed; } .trap { position: var(--overlay); }",
      ".profile-scope--x",
    );
    expect(result.rejected.some((r) => r.toLowerCase().includes("position"))).toBe(true);
    expect(result.css).toBe("");
  });

  it("rejects invalid escaped code points without throwing", () => {
    const result = validateProfileCustomCss(".x { color: \\110000; }", "testuser");
    expect(result.ok).toBe(true);
  });

  it("maps a null escape (\\0) to the replacement character without throwing", () => {
    const result = validateProfileCustomCss(".x { color: \\0; }", "testuser");
    expect(result.ok).toBe(true);
  });

  it("maps a lone surrogate-half escape to the replacement character without throwing", () => {
    const result = validateProfileCustomCss(".x { color: \\d800; }", "testuser");
    expect(result.ok).toBe(true);
  });

  it("allows @media prefers-reduced-motion", () => {
    const result = scopeProfileCss(
      "@media (prefers-reduced-motion: reduce) { .panel { animation: none; } }",
      ".profile-scope--x",
    );
    expect(result.rejected).toHaveLength(0);
    expect(result.css).toContain("@media");
  });
});

describe("profileScopeClass", () => {
  it("sanitizes handle into a safe class name", () => {
    expect(profileScopeClass("Void_Arcade")).toBe("profile-scope--void_arcade");
  });
});
