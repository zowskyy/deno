import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "./db";
import { checkRateLimit, RateLimitError } from "./rateLimit";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const key = "report:test-user";
    expect(() => {
      for (let i = 0; i < 5; i++) checkRateLimit(key, 5);
    }).not.toThrow();
  });

  it("rejects when the limit is exceeded within the window", () => {
    const key = "report:test-user";
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5);
    expect(() => checkRateLimit(key, 5)).toThrow(RateLimitError);
  });

  it("uses separate counters per key", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("report:a", 5);
    expect(() => checkRateLimit("report:b", 5)).not.toThrow();
  });

  it("includes retry-after seconds on rate limit errors", () => {
    const key = "guestbook:anon";
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3);
    try {
      checkRateLimit(key, 3);
      expect.fail("expected RateLimitError");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("never allows more than maxCount successes under concurrent requests", async () => {
    const key = "login:concurrent-test";
    const maxCount = 5;
    const attempts = 20;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () => Promise.resolve().then(() => checkRateLimit(key, maxCount))),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof RateLimitError,
    ).length;

    expect(succeeded).toBe(maxCount);
    expect(rejected).toBe(attempts - maxCount);
  });
});
