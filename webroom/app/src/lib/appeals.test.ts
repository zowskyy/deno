import { beforeEach, describe, expect, it } from "vitest";
import { authenticateBlockedForAppeal, createUser, InvalidCredentialsError, ValidationError } from "./auth";
import { AppealError, fileAppeal, listOpenAppeals, reviewAppeal } from "./appeals";
import { getDb, resetDbForTests } from "./db";
import { setPlatformBlock } from "./moderation";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("appeals", () => {
  it("files an appeal for a platform-blocked user", () => {
    const mod = createUser("moduser", "correct-horse-battery");
    const user = createUser("blockeduser", "correct-horse-battery");
    setPlatformBlock(user.id, true, mod.id);

    fileAppeal(user.id, "I believe this was a mistake.");
    const open = listOpenAppeals();
    expect(open).toHaveLength(1);
    expect(open[0]!.userHandle).toBe("blockeduser");
  });

  it("rejects appeals from non-blocked users", () => {
    const user = createUser("freeuser", "correct-horse-battery");
    expect(() => fileAppeal(user.id, "please")).toThrow(AppealError);
  });

  it("granting an appeal unblocks the user", () => {
    const mod = createUser("moduser", "correct-horse-battery");
    const user = createUser("blockeduser", "correct-horse-battery");
    setPlatformBlock(user.id, true, mod.id);
    fileAppeal(user.id, "sorry");

    const [appeal] = listOpenAppeals();
    reviewAppeal(appeal!.id, mod.id, "granted", "ok");
    expect(listOpenAppeals()).toHaveLength(0);
    expect(() => authenticateBlockedForAppeal("blockeduser", "correct-horse-battery")).toThrow(ValidationError);
  });

  it("authenticateBlockedForAppeal requires platform block", () => {
    createUser("freeuser", "correct-horse-battery");
    expect(() => authenticateBlockedForAppeal("freeuser", "correct-horse-battery")).toThrow(ValidationError);
    expect(() => authenticateBlockedForAppeal("freeuser", "wrong-password")).toThrow(InvalidCredentialsError);
  });

  it("concurrent open appeals leave exactly one row for the same user", async () => {
    const mod = createUser("moduser", "correct-horse-battery");
    const user = createUser("blockeduser", "correct-horse-battery");
    setPlatformBlock(user.id, true, mod.id);

    const results = await Promise.allSettled([
      Promise.resolve().then(() => fileAppeal(user.id, "first concurrent appeal")),
      Promise.resolve().then(() => fileAppeal(user.id, "second concurrent appeal")),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppealError);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe("You already have an open appeal.");

    const db = getDb();
    const count = db
      .prepare("SELECT COUNT(*) as c FROM appeals WHERE user_id = ? AND status = 'open'")
      .get(user.id) as { c: number };
    expect(count.c).toBe(1);
  });
});
