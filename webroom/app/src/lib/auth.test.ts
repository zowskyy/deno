import { beforeEach, describe, expect, it } from "vitest";
import {
  authenticate,
  createSession,
  createUser,
  destroySession,
  HandleTakenError,
  InvalidCredentialsError,
  resolveSession,
  validateHandle,
  validatePassword,
  ValidationError,
} from "./auth";
import { resetDbForTests } from "./db";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("validateHandle", () => {
  it("accepts a normal handle", () => {
    expect(validateHandle("voidarcade")).toBe("voidarcade");
  });

  it("lowercases the handle", () => {
    expect(validateHandle("VoidArcade")).toBe("voidarcade");
  });

  it("rejects a handle that's too short", () => {
    expect(() => validateHandle("a")).toThrow(ValidationError);
  });

  it("rejects a handle starting with a hyphen", () => {
    expect(() => validateHandle("-void")).toThrow(ValidationError);
  });

  it("rejects spaces", () => {
    expect(() => validateHandle("void arcade")).toThrow(ValidationError);
  });

  it("rejects a handle with a slash (path-injection shaped input)", () => {
    expect(() => validateHandle("void/../admin")).toThrow(ValidationError);
  });

  it("rejects reserved handles", () => {
    expect(() => validateHandle("explore")).toThrow(ValidationError);
    expect(() => validateHandle("ADMIN")).toThrow(ValidationError);
  });

  it("rejects a handle over 30 characters", () => {
    expect(() => validateHandle("a".repeat(31))).toThrow(ValidationError);
  });
});

describe("validatePassword", () => {
  it("accepts a reasonable password", () => {
    expect(() => validatePassword("correct-horse-battery")).not.toThrow();
  });

  it("rejects a short password", () => {
    expect(() => validatePassword("short")).toThrow(ValidationError);
  });

  it("rejects an absurdly long password (DoS-shaped input)", () => {
    expect(() => validatePassword("a".repeat(1000))).toThrow(ValidationError);
  });
});

describe("createUser", () => {
  it("creates a user with a valid handle and password", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    expect(user.handle).toBe("voidarcade");
    expect(user.id).toBeTruthy();
  });

  it("rejects a duplicate handle regardless of case", () => {
    createUser("voidarcade", "correct-horse-battery");
    expect(() => createUser("VoidArcade", "another-password")).toThrow(HandleTakenError);
  });

  it("rejects an invalid handle before touching the database", () => {
    expect(() => createUser("a", "correct-horse-battery")).toThrow(ValidationError);
  });
});

describe("authenticate", () => {
  it("authenticates with the correct password", () => {
    createUser("voidarcade", "correct-horse-battery");
    const user = authenticate("voidarcade", "correct-horse-battery");
    expect(user.handle).toBe("voidarcade");
  });

  it("is case-insensitive on handle", () => {
    createUser("voidarcade", "correct-horse-battery");
    expect(() => authenticate("VoidArcade", "correct-horse-battery")).not.toThrow();
  });

  it("rejects the wrong password", () => {
    createUser("voidarcade", "correct-horse-battery");
    expect(() => authenticate("voidarcade", "wrong-password")).toThrow(InvalidCredentialsError);
  });

  it("rejects a nonexistent handle with the same error as a wrong password (no account-existence leak)", () => {
    expect(() => authenticate("nobody-here", "whatever")).toThrow(InvalidCredentialsError);
  });
});

describe("sessions", () => {
  it("resolves a valid session token to the right user", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    const token = createSession(user.id);
    const resolved = resolveSession(token);
    expect(resolved?.id).toBe(user.id);
  });

  it("returns null for a garbage token", () => {
    expect(resolveSession("not-a-real-token")).toBeNull();
  });

  it("returns null for an undefined token (no cookie present)", () => {
    expect(resolveSession(undefined)).toBeNull();
  });

  it("returns null after the session is destroyed", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    const token = createSession(user.id);
    destroySession(token);
    expect(resolveSession(token)).toBeNull();
  });

  it("destroying an already-destroyed session is a no-op, not an error", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    const token = createSession(user.id);
    destroySession(token);
    expect(() => destroySession(token)).not.toThrow();
  });
});
