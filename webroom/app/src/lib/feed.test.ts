import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import { savePageDocument, setPublished, setVisibility } from "./pageDocument";
import { listFeedItems, recordFeedEvent } from "./feed";

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
});
