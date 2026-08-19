import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getPageDocument } from "@/lib/pageDocument";
import { listSharedThemes } from "@/lib/sharedThemes";
import { TEMPLATE_OPTIONS } from "@/lib/templates";
import { forkThemeAction, installThemeAction } from "./actions";
import { PublishThemeForm } from "./PublishThemeForm";
import { ThemeReportForm } from "./ThemeReportForm";

function templateLabel(id: string): string {
  return TEMPLATE_OPTIONS.find((t) => t.id === id)?.label ?? id;
}

export default async function ThemeGalleryPage() {
  const themes = listSharedThemes();
  const viewer = await getCurrentUser();
  const stored = viewer ? getPageDocument(viewer.id) : null;

  return (
    <main className="container explore-container">
      <header className="explore-header">
        <p className="mono explore-kicker">
          <Link href="/explore">Explore</Link> / themes
        </p>
        <h1>Theme gallery</h1>
        <p className="explore-lead">
          Browse shared looks, install one on your page, or fork and remix — creator credit travels with the theme.
        </p>
      </header>

      {viewer && stored && (
        <section className="explore-section theme-publish-section">
          <h2>Share your look</h2>
          <p className="explore-section-note">
            Publish your current page theme for others to install or fork. Your handle is attached as creator.
          </p>
          <PublishThemeForm defaultName={`${stored.document.identity.displayName}'s theme`} />
        </section>
      )}

      {themes.length === 0 ? (
        <p className="explore-empty">No shared themes yet — be the first to publish one.</p>
      ) : (
        <ul className="theme-gallery-list">
          {themes.map((theme) => (
            <li key={theme.id} className="theme-gallery-card">
              <div className="theme-gallery-preview" aria-hidden="true">
                <span className="theme-swatch" style={{ background: theme.themeData.background }} />
                <span className="theme-swatch theme-swatch-accent" style={{ background: theme.themeData.accent }} />
              </div>
              <div className="theme-gallery-body">
                <h2 className="theme-gallery-name">
                  <Link href={`/explore/themes/${theme.id}`}>{theme.name}</Link>
                </h2>
                <p className="theme-gallery-description">{theme.description}</p>
                <p className="theme-gallery-meta mono">
                  by @{theme.creatorHandle}
                  <span className="theme-gallery-sep"> · </span>
                  {templateLabel(theme.themeData.template)}
                  <span className="theme-gallery-sep"> · </span>
                  v{theme.version}
                </p>
                {theme.tags.length > 0 && (
                  <ul className="theme-tag-list">
                    {theme.tags.map((tag) => (
                      <li key={tag}>
                        <span className="theme-tag">{tag}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="theme-gallery-actions">
                  {viewer ? (
                    <form action={installThemeAction.bind(null, theme.id)}>
                      <button type="submit" className="btn">
                        Install on my page
                      </button>
                    </form>
                  ) : (
                    <Link href={`/login?next=/explore/themes`} className="btn">
                      Log in to install
                    </Link>
                  )}
                  {viewer ? (
                    <form action={forkThemeAction.bind(null, theme.id)}>
                      <button type="submit" className="btn secondary">
                        Fork
                      </button>
                    </form>
                  ) : (
                    <Link href={`/login?next=/explore/themes/${theme.id}`} className="btn secondary">
                      Log in to fork
                    </Link>
                  )}
                  <Link href={`/explore/themes/${theme.id}`} className="btn secondary">
                    Details
                  </Link>
                </div>
                <ThemeReportForm themeId={theme.id} compact />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="explore-back">
        <Link href="/explore">Back to Explore</Link>
      </p>
    </main>
  );
}
