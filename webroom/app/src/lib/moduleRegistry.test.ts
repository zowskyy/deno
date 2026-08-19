import { describe, expect, it } from "vitest";
import { PAGE_MODULE_REGISTRY, renderPagePart } from "./moduleRegistry";
import { defaultPageDocument } from "./pageDocument";

describe("PAGE_MODULE_REGISTRY", () => {
  it("includes all Phase 5 modules", () => {
    expect(PAGE_MODULE_REGISTRY.shrine).toBeDefined();
    expect(PAGE_MODULE_REGISTRY.playlist).toBeDefined();
    expect(PAGE_MODULE_REGISTRY.pixelArt).toBeDefined();
    expect(PAGE_MODULE_REGISTRY.miniPages).toBeDefined();
  });

  it("renders unsupported module without crashing", () => {
    const doc = defaultPageDocument("Test");
    const node = renderPagePart("unknown-module-xyz", {
      document: doc,
      handle: "test",
      readerMode: false,
      friends: [],
      guestbookEntries: [],
      topEightLinks: [],
    });
    expect(node).not.toBeNull();
  });
});
