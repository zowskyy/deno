import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import {
  ensureModeratorSeed,
  findUserForModeration,
  isModerator,
  listModeratorLogs,
  listOpenReports,
  reviewReport,
  setPlatformBlock,
} from "./moderation";
import { fileReport } from "./reports";

process.env.WEBROOM_DB_PATH = ":memory:";
process.env.WEBROOM_AUTO_MODERATOR_SEED = "true";

beforeEach(() => {
  resetDbForTests();
});

describe("ensureModeratorSeed", () => {
  it("promotes the first user when no moderators exist", () => {
    const a = createUser("voidarcade", "correct-horse-battery");
    createUser("neonorchard", "correct-horse-battery");
    expect(isModerator(a.id)).toBe(false);
    ensureModeratorSeed();
    expect(isModerator(a.id)).toBe(true);
  });

  it("does nothing when a moderator already exists", () => {
    const a = createUser("voidarcade", "correct-horse-battery");
    ensureModeratorSeed();
    const b = createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();
    expect(isModerator(a.id)).toBe(true);
    expect(isModerator(b.id)).toBe(false);
  });

  it("promotes WEBROOM_MODERATOR_HANDLE when set", () => {
    delete process.env.WEBROOM_AUTO_MODERATOR_SEED;
    createUser("voidarcade", "correct-horse-battery");
    const target = createUser("modtarget", "correct-horse-battery");
    process.env.WEBROOM_MODERATOR_HANDLE = "modtarget";
    ensureModeratorSeed();
    expect(isModerator(target.id)).toBe(true);
    delete process.env.WEBROOM_MODERATOR_HANDLE;
    process.env.WEBROOM_AUTO_MODERATOR_SEED = "true";
  });

  it("skips auto-seed when neither env is set", () => {
    delete process.env.WEBROOM_AUTO_MODERATOR_SEED;
    delete process.env.WEBROOM_MODERATOR_HANDLE;
    const a = createUser("voidarcade", "correct-horse-battery");
    ensureModeratorSeed();
    expect(isModerator(a.id)).toBe(false);
    process.env.WEBROOM_AUTO_MODERATOR_SEED = "true";
  });
});

describe("report queue", () => {
  it("lists open reports with reporter handles", () => {
    const reporter = createUser("voidarcade", "correct-horse-battery");
    createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();
    fileReport(reporter.id, "neonorchard", "spam");

    const open = listOpenReports();
    expect(open).toHaveLength(1);
    expect(open[0]!.reportedHandle).toBe("neonorchard");
    expect(open[0]!.reporterHandle).toBe("voidarcade");
    expect(open[0]!.status).toBe("open");
  });

  it("reviewing a report removes it from the open queue and logs the action", () => {
    const mod = createUser("moduser", "correct-horse-battery");
    const reporter = createUser("voidarcade", "correct-horse-battery");
    createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();
    fileReport(reporter.id, "neonorchard", "harassment");

    const [report] = listOpenReports();
    reviewReport(report!.id, mod.id, "reviewed", "looked into it");

    expect(listOpenReports()).toHaveLength(0);
    const logs = listModeratorLogs();
    expect(logs.some((l) => l.action === "report_reviewed" && l.targetHandle === "neonorchard")).toBe(true);
  });
});

describe("platform block", () => {
  it("blocks and unblocks a user by handle", () => {
    const mod = createUser("moduser", "correct-horse-battery");
    const target = createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();

    setPlatformBlock(target.id, true, mod.id);
    expect(findUserForModeration("neonorchard")!.isBlockedPlatform).toBe(true);

    setPlatformBlock(target.id, false, mod.id);
    expect(findUserForModeration("neonorchard")!.isBlockedPlatform).toBe(false);
  });
});
