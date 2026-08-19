import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { getDb, resetDbForTests } from "./db";
import {
  DirectMessageError,
  listConversations,
  listDirectMessagesForUser,
  sendDirectMessage,
} from "./directMessages";
import { blockUser } from "./friends";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("sendDirectMessage", () => {
  it("delivers a message between two users", async () => {
    const a = createUser("senderone", "correct-horse-battery");
    const b = createUser("receiver1", "correct-horse-battery");
    const msg = await sendDirectMessage(a.id, b.id, "Hello there!");
    expect(msg.body).toBe("Hello there!");
    const thread = listDirectMessagesForUser(a.id, { withUserId: b.id });
    expect(thread[0]?.body).toBe("Hello there!");
    expect(listConversations(b.id)[0]?.otherHandle).toBe("senderone");
  });

  it("rejects self-messages", async () => {
    const a = createUser("lonely", "correct-horse-battery");
    await expect(sendDirectMessage(a.id, a.id, "hi")).rejects.toThrow(DirectMessageError);
  });

  it("rejects messages when blocked", async () => {
    const a = createUser("blocker", "correct-horse-battery");
    const b = createUser("blocked", "correct-horse-battery");
    blockUser(a.id, b.id);
    await expect(sendDirectMessage(b.id, a.id, "hi")).rejects.toThrow(DirectMessageError);
  });

  it("returns the inserted message even when timestamps match", async () => {
    const a = createUser("senderdup", "correct-horse-battery");
    const b = createUser("receiverdup", "correct-horse-battery");
    const now = "2025-01-01T00:00:00.000Z";
    const db = getDb();
    db.prepare(
      "INSERT INTO direct_messages (id, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run("older-msg", a.id, b.id, "older", now);

    const msg = await sendDirectMessage(a.id, b.id, "newest");
    expect(msg.body).toBe("newest");
    expect(msg.id).not.toBe("older-msg");
  });
});
