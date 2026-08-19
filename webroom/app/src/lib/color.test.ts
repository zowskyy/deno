import { describe, expect, it } from "vitest";
import { readableTextFor } from "./color";

describe("readableTextFor", () => {
  it("picks light text on a near-black background", () => {
    const result = readableTextFor("#160a23");
    expect(result.ink).toContain("255,255,255");
  });

  it("picks dark text on a light background", () => {
    const result = readableTextFor("#f1ede9");
    expect(result.ink).toContain("20,14,26");
  });

  it("picks light text on pure black", () => {
    expect(readableTextFor("#000000").ink).toContain("255,255,255");
  });

  it("picks dark text on pure white", () => {
    expect(readableTextFor("#ffffff").ink).toContain("20,14,26");
  });

  it("always returns a distinct, more transparent 'soft' variant", () => {
    const { ink, inkSoft } = readableTextFor("#160a23");
    expect(inkSoft).not.toBe(ink);
  });
});
