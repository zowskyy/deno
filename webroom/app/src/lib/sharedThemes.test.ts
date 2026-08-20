import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureSeedSharedThemes,
  listOpenThemeReports,
  listSharedThemes,
  publishTheme,
  reportTheme,
  reviewThemeReport,
} from "./sharedThemes";
import { createUser } from "./auth";
import { defaultPageDocument, savePageDocument } from "./pageDocument";
import { resetDbForTests, getDb } from "./db";
import { listModeratorLogs } from "./moderation";

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

  it("reviewThemeReport returns false for already-reviewed reports", () => {
    ensureSeedSharedThemes();
    const reporter = createUser("voidarcade", "correct-horse-battery");
    const mod = createUser("moduser", "correct-horse-battery");
    const [theme] = listSharedThemes();

    reportTheme(theme!.id, reporter.id, "inappropriate");
    const [report] = listOpenThemeReports();
    expect(reviewThemeReport(report!.id, mod.id, "reviewed", "first")).toBe(true);
    expect(reviewThemeReport(report!.id, mod.id, "dismissed", "stale")).toBe(false);
    expect(listOpenThemeReports()).toHaveLength(0);
  });

  it("persists the same normalized moderator note in the database and audit log", () => {
    ensureSeedSharedThemes();
    const reporter = createUser("voidarcade", "correct-horse-battery");
    const mod = createUser("moduser", "correct-horse-battery");
    const [theme] = listSharedThemes();
    const db = getDb();

    reportTheme(theme!.id, reporter.id, "inappropriate");
    const [report] = listOpenThemeReports();
    expect(reviewThemeReport(report!.id, mod.id, "reviewed", "  trimmed note  ")).toBe(true);

    const stored = db
      .prepare("SELECT moderator_note FROM theme_reports WHERE id = ?")
      .get(report!.id) as { moderator_note: string | null };
    const [log] = listModeratorLogs(1);
    expect(stored.moderator_note).toBe("trimmed note");
    expect(log?.detail).toBe(`reportId:${report!.id} — trimmed note`);

    reportTheme(theme!.id, reporter.id, "still bad");
    const [blankReport] = listOpenThemeReports();
    expect(reviewThemeReport(blankReport!.id, mod.id, "dismissed", "   ")).toBe(true);
    const blankStored = db
      .prepare("SELECT moderator_note FROM theme_reports WHERE id = ?")
      .get(blankReport!.id) as { moderator_note: string | null };
    const blankLog = listModeratorLogs(10).find((entry) => entry.detail.startsWith(`reportId:${blankReport!.id}`));
    expect(blankStored.moderator_note).toBeNull();
    expect(blankLog?.detail).toBe(`reportId:${blankReport!.id}`);
  });
});
