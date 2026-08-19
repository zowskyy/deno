import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultPageDocument,
  getPageDocument,
  listVersions,
  parsePageDocument,
  PageDocumentValidationError,
  restoreVersion,
  savePageDocument,
  setPublished,
  setVisibility,
  VersionNotFoundError,
} from "./pageDocument";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("parsePageDocument", () => {
  it("accepts a well-formed document", () => {
    const doc = defaultPageDocument("Void Arcade");
    expect(() => parsePageDocument(doc)).not.toThrow();
  });

  it("rejects a document with the wrong schema version", () => {
    const doc = { ...defaultPageDocument("Void"), version: 2 };
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects a non-hex-color theme value (CSS-injection-shaped input)", () => {
    const doc = defaultPageDocument("Void");
    (doc.theme as unknown as Record<string, string>).accent = "red; } body { display:none";
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects a javascript: URL in a link", () => {
    const doc = defaultPageDocument("Void");
    doc.links.push({ label: "click me", url: "javascript:alert(1)" });
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects a data: URL in a link", () => {
    const doc = defaultPageDocument("Void");
    doc.links.push({ label: "click me", url: "data:text/html,<script>alert(1)</script>" });
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects a bio over the length limit", () => {
    const doc = defaultPageDocument("Void");
    doc.identity.bio = "x".repeat(281);
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects an unknown page part id", () => {
    const doc = defaultPageDocument("Void");
    (doc.pageParts as string[]).push("javascript-executor");
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects completely malformed input (not an object)", () => {
    expect(() => parsePageDocument("not a document")).toThrow(PageDocumentValidationError);
    expect(() => parsePageDocument(null)).toThrow(PageDocumentValidationError);
    expect(() => parsePageDocument(undefined)).toThrow(PageDocumentValidationError);
  });

  it("error message lists the actual issues, not a generic message", () => {
    try {
      parsePageDocument({});
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PageDocumentValidationError);
      const err = e as PageDocumentValidationError;
      expect(err.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("savePageDocument / getPageDocument", () => {
  it("saves and retrieves a document for a real user", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void Arcade"));
    const stored = getPageDocument(user.id);
    expect(stored?.document.identity.displayName).toBe("Void Arcade");
    expect(stored?.isPublished).toBe(false);
    expect(stored?.visibility).toBe("private");
  });

  it("returns null for a user with no page document yet", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    expect(getPageDocument(user.id)).toBeNull();
  });

  it("refuses to save an invalid document even for a real user", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    expect(() => savePageDocument(user.id, { garbage: true })).toThrow(PageDocumentValidationError);
    expect(getPageDocument(user.id)).toBeNull();
  });

  it("overwriting a document snapshots the previous version", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("First Name"));
    savePageDocument(user.id, defaultPageDocument("Second Name"));

    const versions = listVersions(user.id);
    expect(versions.length).toBe(1);

    const stored = getPageDocument(user.id);
    expect(stored?.document.identity.displayName).toBe("Second Name");
  });
});

describe("restoreVersion", () => {
  it("restores an earlier version as current, and that restore is itself snapshotted", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("First Name"));
    savePageDocument(user.id, defaultPageDocument("Second Name"));

    const versions = listVersions(user.id);
    const firstVersionId = versions[versions.length - 1]!.id;

    restoreVersion(user.id, firstVersionId);
    expect(getPageDocument(user.id)?.document.identity.displayName).toBe("First Name");

    // Restoring is itself a save, so it's reversible too.
    expect(listVersions(user.id).length).toBe(2);
  });

  it("throws for a version id that doesn't exist", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void"));
    expect(() => restoreVersion(user.id, "not-a-real-version-id")).toThrow(VersionNotFoundError);
  });

  it("throws if the version belongs to a different user (no cross-account restore)", () => {
    const userA = createUser("voidarcade", "correct-horse-battery");
    const userB = createUser("otheruser", "correct-horse-battery");
    savePageDocument(userA.id, defaultPageDocument("A v1"));
    savePageDocument(userA.id, defaultPageDocument("A v2"));
    const versionId = listVersions(userA.id)[0]!.id;

    expect(() => restoreVersion(userB.id, versionId)).toThrow(VersionNotFoundError);
  });
});

describe("setPublished / setVisibility", () => {
  it("publishes a page that already has a document", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void"));
    setPublished(user.id, true);
    expect(getPageDocument(user.id)?.isPublished).toBe(true);
  });

  it("refuses to publish before any document exists", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    expect(() => setPublished(user.id, true)).toThrow();
  });

  it("changes visibility", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void"));
    setVisibility(user.id, "public");
    expect(getPageDocument(user.id)?.visibility).toBe("public");
  });
});
