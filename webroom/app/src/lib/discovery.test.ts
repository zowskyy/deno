import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import {
  getRandomPage,
  listByTag,
  listByTemplate,
  listPopularTags,
  listRecentlyPublished,
  searchPages,
} from "./discovery";
import {
  defaultPageDocument,
  savePageDocument,
  setHiddenFromDiscovery,
  setPublished,
  setVisibility,
  type TemplateId,
} from "./pageDocument";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

function publishPublicPage(
  handle: string,
  displayName: string,
  opts: { tags?: string[]; template?: TemplateId } = {},
) {
  const user = createUser(handle, "correct-horse-battery");
  const doc = defaultPageDocument(displayName);
  if (opts.template) doc.theme.template = opts.template;
  if (opts.tags) doc.tags = opts.tags;
  savePageDocument(user.id, doc);
  setPublished(user.id, true);
  setVisibility(user.id, "public");
  return user;
}

describe("listRecentlyPublished", () => {
  it("returns only public, published, discoverable pages", () => {
    publishPublicPage("visibleone", "Visible One");
    const privateUser = createUser("privateone", "correct-horse-battery");
    savePageDocument(privateUser.id, defaultPageDocument("Private"));
    setPublished(privateUser.id, true);
    setVisibility(privateUser.id, "private");

    const hidden = publishPublicPage("hiddenone", "Hidden One");
    setHiddenFromDiscovery(hidden.id, true);

    const pages = listRecentlyPublished();
    expect(pages.map((p) => p.handle)).toEqual(["visibleone"]);
  });
});

describe("listByTag", () => {
  it("finds pages with a matching tag", () => {
    publishPublicPage("tagged", "Tagged", { tags: ["cozy", "art"] });
    publishPublicPage("other", "Other", { tags: ["loud"] });

    const cozy = listByTag("cozy");
    expect(cozy.map((p) => p.handle)).toEqual(["tagged"]);
  });

  it("is case-insensitive on the tag query", () => {
    publishPublicPage("tagged", "Tagged", { tags: ["cozy"] });
    expect(listByTag("COZY").length).toBe(1);
  });
});

describe("listByTemplate", () => {
  it("filters recently published pages by template", () => {
    publishPublicPage("soft", "Soft", { template: "soft-web" });
    publishPublicPage("pixel", "Pixel", { template: "pixel-tavern" });

    const soft = listByTemplate("soft-web");
    expect(soft.map((p) => p.handle)).toEqual(["soft"]);
  });
});

describe("listPopularTags", () => {
  it("orders tags by usage count", () => {
    publishPublicPage("usercozy", "User Cozy", { tags: ["cozy"] });
    publishPublicPage("userboth", "User Both", { tags: ["cozy", "art"] });
    publishPublicPage("userart", "User Art", { tags: ["art"] });

    const tags = listPopularTags();
    expect(tags[0]).toEqual({ tag: "art", count: 2 });
    expect(tags[1]).toEqual({ tag: "cozy", count: 2 });
  });
});

describe("searchPages", () => {
  it("matches handle and document text", () => {
    publishPublicPage("neonorchard", "Neon Orchard", { tags: ["retro"] });
    publishPublicPage("quietroom", "Quiet Room");

    expect(searchPages("neon").map((p) => p.handle)).toEqual(["neonorchard"]);
    expect(searchPages("retro").map((p) => p.handle)).toEqual(["neonorchard"]);
    expect(searchPages("quiet room").map((p) => p.handle)).toEqual(["quietroom"]);
  });

  it("returns empty for blank queries", () => {
    publishPublicPage("useralpha", "User Alpha");
    expect(searchPages("")).toEqual([]);
    expect(searchPages("   ")).toEqual([]);
  });
});

describe("getRandomPage", () => {
  it("returns a discoverable page when one exists", () => {
    publishPublicPage("randompick", "Random Pick");
    const page = getRandomPage();
    expect(page?.handle).toBe("randompick");
  });

  it("returns null when no discoverable pages exist", () => {
    expect(getRandomPage()).toBeNull();
  });
});
