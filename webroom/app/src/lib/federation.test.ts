import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import { savePageDocument, setPublished, setVisibility } from "./pageDocument";
import { exportLocalProfile, FederationError, followRemoteProfile } from "./federation";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

function publishUser(handle: string) {
  const user = createUser(handle, "correct-horse-battery");
  savePageDocument(user.id, {
    version: 3,
    identity: { displayName: handle, bio: "bio" },
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
    tags: ["art"],
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

describe("exportLocalProfile", () => {
  it("exports public profiles", () => {
    publishUser("feduser");
    const profile = exportLocalProfile("feduser");
    expect(profile?.handle).toBe("feduser");
    expect(profile?.tags).toContain("art");
  });

  it("returns null for unknown handles", () => {
    expect(exportLocalProfile("nobody")).toBeNull();
  });
});

describe("followRemoteProfile", () => {
  it("rejects private network hosts", () => {
    const user = createUser("follower", "correct-horse-battery");
    expect(() =>
      followRemoteProfile(user.id, "https://localhost/api/federation/profile/x"),
    ).toThrow(FederationError);
  });
});
