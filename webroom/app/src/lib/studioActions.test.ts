import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "./auth";
import {
  defaultPageDocument,
  getPageDocument,
  saveDraftDocument,
  savePageDocument,
} from "./pageDocument";
import { documentWithUnsafeCss, validateDocumentCss } from "./studioValidation";
import { resetDbForTests, getDb } from "./db";
import { listSharedThemes } from "./sharedThemes";

process.env.WEBROOM_DB_PATH = ":memory:";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: url });
  }),
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "@/lib/session";
import {
  importPageAction,
  publishDraftAction,
  publishThemeAction,
  saveAndPublishAction,
  saveDraftAction,
} from "../app/(platform)/studio/actions";
import { publishThemeAction as explorePublishThemeAction } from "../app/(platform)/explore/themes/actions";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);

beforeEach(() => {
  resetDbForTests();
  vi.clearAllMocks();
  listSharedThemes();
});

function mockViewer(handle: string) {
  const user = createUser(handle, "correct-horse-battery");
  savePageDocument(user.id, defaultPageDocument("Display"));
  mockedGetCurrentUser.mockResolvedValue({ id: user.id, handle: user.handle, createdAt: user.createdAt });
  return user;
}

function unsafeDocumentJson(): string {
  return JSON.stringify(documentWithUnsafeCss("Unsafe"));
}

describe("validateDocumentCss", () => {
  it("rejects global body selectors in custom CSS", () => {
    const doc = documentWithUnsafeCss("Test");
    expect(validateDocumentCss(doc, "testuser")).toMatch(/Custom CSS blocked/);
  });
});

describe("studio actions reject unsafe CSS", () => {
  it("saveDraftAction returns error and does not persist draft", async () => {
    const user = mockViewer("draftuser");
    const before = getPageDocument(user.id);

    const result = await saveDraftAction(unsafeDocumentJson());

    expect(result.error).toMatch(/Custom CSS blocked/);
    expect(getPageDocument(user.id)?.draftDocument).toBe(before?.draftDocument ?? null);
  });

  it("saveAndPublishAction returns error and does not change published document", async () => {
    const user = mockViewer("publishuser");
    const beforeJson = JSON.stringify(getPageDocument(user.id)!.document);

    const result = await saveAndPublishAction(unsafeDocumentJson());

    expect(result.error).toMatch(/Custom CSS blocked/);
    expect(JSON.stringify(getPageDocument(user.id)!.document)).toBe(beforeJson);
  });

  it("publishDraftAction returns error when draft CSS is unsafe", async () => {
    const user = mockViewer("draftpubuser");
    saveDraftDocument(user.id, documentWithUnsafeCss("Draft"));

    const result = await publishDraftAction();

    expect(result.error).toMatch(/Custom CSS blocked/);
    expect(getPageDocument(user.id)?.draftDocument).not.toBeNull();
  });

  it("importPageAction returns error and does not import unsafe CSS", async () => {
    const user = mockViewer("importuser");
    const beforeJson = JSON.stringify(getPageDocument(user.id)!.document);
    const payload = JSON.stringify({ document: documentWithUnsafeCss("Import") });

    const result = await importPageAction(payload);

    expect(result.error).toMatch(/Custom CSS blocked/);
    expect(JSON.stringify(getPageDocument(user.id)!.document)).toBe(beforeJson);
  });

  it("studio publishThemeAction returns error and does not publish theme", async () => {
    const user = mockViewer("themeuser");
    savePageDocument(user.id, documentWithUnsafeCss("Theme"));
    const beforeCount = getDb().prepare("SELECT COUNT(*) as c FROM shared_themes WHERE creator_user_id = ?").get(user.id) as {
      c: number;
    };

    const result = await publishThemeAction("My Theme", "desc", "neon");

    expect(result.error).toMatch(/Custom CSS blocked/);
    const afterCount = getDb().prepare("SELECT COUNT(*) as c FROM shared_themes WHERE creator_user_id = ?").get(user.id) as {
      c: number;
    };
    expect(afterCount.c).toBe(beforeCount.c);
  });

  it("explore publishThemeAction returns error and does not publish theme", async () => {
    const user = mockViewer("exploretheme");
    savePageDocument(user.id, documentWithUnsafeCss("Explore"));
    const beforeCount = getDb().prepare("SELECT COUNT(*) as c FROM shared_themes WHERE creator_user_id = ?").get(user.id) as {
      c: number;
    };
    const formData = new FormData();
    formData.set("name", "Bad Theme");
    formData.set("description", "unsafe");
    formData.set("tags", "neon");

    const result = await explorePublishThemeAction({}, formData);

    expect(result.error).toMatch(/Custom CSS blocked/);
    const afterCount = getDb().prepare("SELECT COUNT(*) as c FROM shared_themes WHERE creator_user_id = ?").get(user.id) as {
      c: number;
    };
    expect(afterCount.c).toBe(beforeCount.c);
  });
});
