import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listInstalledPlugins, listMarketplacePlugins } from "@/lib/plugins";
import { installPluginAction } from "./actions";

export default async function MarketplacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const catalog = listMarketplacePlugins();
  const installed = listInstalledPlugins(user.id);
  const installedSlugs = new Set(installed.map((p) => p.slug));

  return (
    <main className="container marketplace-container">
      <header className="explore-header">
        <p className="mono explore-kicker">Marketplace</p>
        <h1>Plugin marketplace</h1>
        <p className="explore-lead">Install extra page modules for your Studio — structured data only, no arbitrary code.</p>
      </header>

      <section className="profile-panel">
        <h2 className="part-label">Available plugins</h2>
        <ul className="marketplace-list">
          {catalog.map((plugin) => (
            <li key={plugin.id} className="marketplace-item">
              <h3>{plugin.name}</h3>
              <p>{plugin.description}</p>
              {installedSlugs.has(plugin.slug) ? (
                <p className="mono">Installed</p>
              ) : (
                <form action={installPluginAction}>
                  <input type="hidden" name="slug" value={plugin.slug} />
                  <button type="submit" className="btn-secondary">
                    Install
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
