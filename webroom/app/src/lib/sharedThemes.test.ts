import { beforeEach, describe, expect, it } from "vitest";
import { ensureSeedSharedThemes, listSharedThemes, publishTheme } from "./sharedThemes";
import { createUser } from "./auth";
import { defaultPageDocument, savePageDocument } from "./pageDocument";
import { resetDbForTests } from "./db";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("sharedThemes", () => {
  it("seeds starter themes when gallery is empty", () => {
    const themes = listSharedThemes();
    expect(themes.length).toBeGreaterThanOrEqual(8);
    expect(themes.some((t) => t.name === "Y2K Chrome")).toBe(true);
  });

  it("publishes a user theme with attribution", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void Arcade"));
    const id = publishTheme(user.id, user.handle, "My Look", "A cozy corner", ["soft"], defaultPageDocument("Void").theme);
    const themes = listSharedThemes();
    expect(themes.some((t) => t.id === id && t.creatorHandle === "voidarcade")).toBe(true);
  });

  it("ensureSeedSharedThemes is idempotent", () => {
    ensureSeedSharedThemes();
    const first = listSharedThemes().length;
    ensureSeedSharedThemes();
    expect(listSharedThemes().length).toBe(first);
  });
});
