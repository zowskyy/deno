import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import { savePageDocument, setPublished, setVisibility } from "./pageDocument";
import { listRecommendedPages } from "./recommendations";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

function makePage(handle: string, tags: string[]) {
  const user = createUser(handle, "correct-horse-battery");
  savePageDocument(user.id, {
    version: 3,
    identity: { displayName: handle, bio: "" },
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
    tags,
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
  return user;
}

describe("listRecommendedPages", () => {
  it("ranks pages with shared tags higher", () => {
    const viewer = makePage("viewer", ["zines", "art"]);
    makePage("matchtags", ["art", "music"]);
    makePage("nomatch", ["sports"]);

    const recs = listRecommendedPages(viewer.id, 5);
    expect(recs.length).toBeGreaterThan(0);
    const match = recs.find((r) => r.handle === "matchtags");
    const noMatch = recs.find((r) => r.handle === "nomatch");
    expect(match).toBeDefined();
    if (match && noMatch) {
      expect(match.score).toBeGreaterThan(noMatch.score);
    }
  });
});
