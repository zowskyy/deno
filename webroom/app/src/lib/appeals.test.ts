import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
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

  it("rejects a duplicate open appeal and keeps exactly one row", () => {
    const mod = createUser("moduser", "correct-horse-battery");
    const user = createUser("blockeduser", "correct-horse-battery");
    setPlatformBlock(user.id, true, mod.id);

    const db = getDb();
    fileAppeal(user.id, "first appeal");
    expect(() => fileAppeal(user.id, "second appeal")).toThrow(AppealError);
    expect(() =>
      db
        .prepare(
          "INSERT INTO appeals (id, user_id, appeal_type, reason, created_at) VALUES (?, ?, 'platform_block', ?, ?)",
        )
        .run(randomUUID(), user.id, "racing appeal", new Date().toISOString()),
    ).toThrow(/UNIQUE constraint failed/);

    const count = db
      .prepare("SELECT COUNT(*) as c FROM appeals WHERE user_id = ? AND status = 'open'")
      .get(user.id) as { c: number };
    expect(count.c).toBe(1);
  });

  it("reviewAppeal returns false when the appeal is no longer open", () => {
    const mod = createUser("moduser", "correct-horse-battery");
    const user = createUser("blockeduser", "correct-horse-battery");
    setPlatformBlock(user.id, true, mod.id);
    fileAppeal(user.id, "please review");

    const [appeal] = listOpenAppeals();
    expect(reviewAppeal(appeal!.id, mod.id, "granted", "ok")).toBe(true);
    expect(reviewAppeal(appeal!.id, mod.id, "dismissed", "too late")).toBe(false);
  });
});
