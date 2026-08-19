import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import {
  ensureSeedMarketplacePlugins,
  installMarketplacePlugin,
  listInstalledPlugins,
  listMarketplacePlugins,
} from "./plugins";

process.env.WEBROOM_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("plugins marketplace", () => {
  it("seeds and installs plugins per user", () => {
    ensureSeedMarketplacePlugins();
    const catalog = listMarketplacePlugins();
    expect(catalog.length).toBeGreaterThan(0);

    const a = createUser("pluginusera", "correct-horse-battery");
    const b = createUser("pluginuserb", "correct-horse-battery");
    const slug = catalog[0]!.slug;

    installMarketplacePlugin(a.id, slug);
    expect(listInstalledPlugins(a.id).some((p) => p.slug === slug)).toBe(true);
    expect(listInstalledPlugins(b.id).some((p) => p.slug === slug)).toBe(false);
  });

  it("throws for unknown plugin slugs", () => {
    ensureSeedMarketplacePlugins();
    const user = createUser("pluginuserc", "correct-horse-battery");
    expect(() => installMarketplacePlugin(user.id, "not-real")).toThrow();
  });
});
