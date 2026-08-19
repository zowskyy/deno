import { describe, expect, it } from "vitest";
import { applyCreativeSpark, applyTemplateMood } from "./creativeSparks";
import { defaultPageDocument } from "./pageDocument";

describe("creativeSparks", () => {
  it("adds a shrine and enables the page part", () => {
    const doc = defaultPageDocument("Test");
    const next = applyCreativeSpark("add-shrine", doc);
    expect(next.pageParts).toContain("shrine");
    expect(next.shrines.length).toBe(1);
    expect(next.shrines[0]!.title.length).toBeGreaterThan(0);
  });

  it("adds badges without exceeding cap", () => {
    const doc = defaultPageDocument("Test");
    const next = applyCreativeSpark("sticker-pack", doc);
    expect(next.badges.length).toBeGreaterThan(0);
    expect(next.pageParts).toContain("badges");
  });

  it("applies template mood presets", () => {
    const doc = defaultPageDocument("Test");
    const next = applyTemplateMood(doc, "pixel-tavern");
    expect(next.theme.template).toBe("pixel-tavern");
    expect(next.theme.fontStyle).toBe("mono");
  });

  it("surprise colors changes accent and background", () => {
    const doc = defaultPageDocument("Test");
    const next = applyCreativeSpark("surprise-colors", doc);
    expect(next.theme.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(next.theme.background).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
