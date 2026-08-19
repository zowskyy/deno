import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import { savePageDocument, setPublished, setVisibility } from "./pageDocument";
import { sendFriendRequest, acceptFriendRequest } from "./friends";
import { listFeedItems, recordFeedEvent, encodeFeedCursor } from "./feed";
import { getDb } from "./db";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("listFeedItems", () => {
  it("includes published page events", () => {
    const user = createUser("feedstar", "correct-horse-battery");
    savePageDocument(user.id, {
      version: 3,
      identity: { displayName: "Feed Star", bio: "hello" },
      theme: {
        template: "start-simple",
        accent: "#c7314b",
        background: "#f1ede9",
        density: "comfortable",
        fontStyle: "sans",
        reduceMotion: false,
        customCss: "",
        customCssEnabled: false,
      },
      pageParts: ["identity"],
      links: [],
      now: "",
      gallery: [],
      blog: [],
      devlog: [],
      badges: [],
      topEight: [],
      tags: [],
      shrines: [],
      playlist: [],
      pixelArt: [],
      miniPages: [],
      plugins: [],
      guestbook: { enabled: true, requireApproval: true },
      access: { altTextReminder: true, contrastWarningsEnabled: true },
    });
    setPublished(user.id, true);
    setVisibility(user.id, "public");
    recordFeedEvent(user.id, "page_updated", { at: new Date().toISOString() });

    const items = listFeedItems(null, { limit: 10 });
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.handle === "feedstar")).toBe(true);
  });

  it("paginates without skipping across friend and non-friend tiers", () => {
    const viewer = createUser("feedviewer", "correct-horse-battery");
    const friend = createUser("feedfriend", "correct-horse-battery");
    const stranger = createUser("feedstranger", "correct-horse-battery");

    for (const user of [viewer, friend, stranger]) {
      savePageDocument(user.id, {
        version: 3,
        identity: { displayName: user.handle, bio: "" },
        theme: {
          template: "start-simple",
          accent: "#c7314b",
          background: "#f1ede9",
          density: "comfortable",
          fontStyle: "sans",
          reduceMotion: false,
          customCss: "",
          customCssEnabled: false,
        },
        pageParts: ["identity"],
        links: [],
        now: "",
        gallery: [],
        blog: [],
        devlog: [],
        badges: [],
        topEight: [],
        tags: [],
        shrines: [],
        playlist: [],
        pixelArt: [],
        miniPages: [],
        plugins: [],
        guestbook: { enabled: true, requireApproval: true },
        access: { altTextReminder: true, contrastWarningsEnabled: true },
      });
      getDb()
        .prepare("UPDATE page_documents SET is_published = 1, visibility = 'public' WHERE user_id = ?")
        .run(user.id);
    }

    sendFriendRequest(viewer.id, friend.id);
    const requestId = (
      getDb()
        .prepare("SELECT id FROM friend_links WHERE requester_id = ? AND addressee_id = ?")
        .get(viewer.id, friend.id) as { id: string }
    ).id;
    acceptFriendRequest(friend.id, requestId);

    const db = getDb();
    const insert = db.prepare(
      "INSERT INTO feed_events (id, user_id, event_type, payload_json, created_at) VALUES (?, ?, 'page_updated', '{}', ?)",
    );
    insert.run("event-friend-new", friend.id, "2025-01-03T00:00:00.000Z");
    insert.run("event-stranger-new", stranger.id, "2025-01-02T00:00:00.000Z");
    insert.run("event-friend-old", friend.id, "2025-01-01T00:00:00.000Z");

    const page1 = listFeedItems(viewer.id, { limit: 2 });
    expect(page1.map((i) => i.id)).toEqual(["event-friend-new", "event-friend-old"]);

    const cursor = encodeFeedCursor(0, "2025-01-01T00:00:00.000Z", "event-friend-old");
    const page2 = listFeedItems(viewer.id, { limit: 2, cursor });
    expect(page2.map((i) => i.id)).toEqual(["event-stranger-new"]);
  });
});
