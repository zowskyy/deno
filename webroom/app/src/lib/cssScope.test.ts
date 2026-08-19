import { describe, expect, it } from "vitest";
import { scopeProfileCss, profileScopeClass } from "./cssScope";

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
