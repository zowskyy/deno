import { beforeEach, describe, expect, it } from "vitest";
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
  it("seeds and installs plugins", () => {
    ensureSeedMarketplacePlugins();
    const catalog = listMarketplacePlugins();
    expect(catalog.length).toBeGreaterThan(0);

    const slug = catalog[0]!.slug;
    installMarketplacePlugin(slug);
    const installed = listInstalledPlugins();
    expect(installed.some((p) => p.slug === slug)).toBe(true);
  });

  it("throws for unknown plugin slugs", () => {
    ensureSeedMarketplacePlugins();
    expect(() => installMarketplacePlugin("not-real")).toThrow();
  });
});
