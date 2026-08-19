import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSharedTheme, listThemeVersions } from "@/lib/sharedThemes";
import { TEMPLATE_OPTIONS } from "@/lib/templates";
import { forkThemeAction, installThemeAction } from "../actions";
import { ThemeReportForm } from "../ThemeReportForm";

interface Props {
  params: Promise<{ id: string }>;
}

function templateLabel(id: string): string {
  return TEMPLATE_OPTIONS.find((t) => t.id === id)?.label ?? id;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default async function ThemeDetailPage({ params }: Props) {
  const { id } = await params;
  const theme = getSharedTheme(id);
  if (!theme) notFound();

  const versions = listThemeVersions(id);
  const viewer = await getCurrentUser();

  return (
    <main className="container explore-container">
      <p className="mono explore-kicker">
        <Link href="/explore">Explore</Link> / <Link href="/explore/themes">themes</Link>
      </p>

      <header className="theme-detail-header">
        <div className="theme-detail-preview" aria-hidden="true">
          <div
            className="theme-detail-swatch theme-detail-swatch-bg"
            style={{ background: theme.themeData.background }}
          />
          <div
            className="theme-detail-swatch theme-detail-swatch-accent"
            style={{ background: theme.themeData.accent }}
          />
        </div>
        <div>
          <h1>{theme.name}</h1>
          <p className="explore-lead">{theme.description}</p>
          <p className="theme-gallery-meta mono">
            by @{theme.creatorHandle}
            <span className="theme-gallery-sep"> · </span>
            {templateLabel(theme.themeData.template)}
            <span className="theme-gallery-sep"> · </span>
            v{theme.version}
          </p>
          {theme.attributionHandle && (
            <p className="theme-attribution-note mono">
              Forked from @{theme.attributionHandle}
              {theme.forkedFromId && (
                <>
                  {" "}
                  (<Link href={`/explore/themes/${theme.forkedFromId}`}>original</Link>)
                </>
              )}
            </p>
          )}
          {theme.tags.length > 0 && (
            <ul className="theme-tag-list">
              {theme.tags.map((tag) => (
                <li key={tag}>
                  <span className="theme-tag">{tag}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <section className="theme-detail-tokens">
        <h2>Theme tokens</h2>
        <dl className="theme-token-list mono">
          <div>
            <dt>Template</dt>
            <dd>{templateLabel(theme.themeData.template)}</dd>
          </div>
          <div>
            <dt>Accent</dt>
            <dd>{theme.themeData.accent}</dd>
          </div>
          <div>
            <dt>Background</dt>
            <dd>{theme.themeData.background}</dd>
          </div>
          <div>
            <dt>Density</dt>
            <dd>{theme.themeData.density}</dd>
          </div>
          <div>
            <dt>Font</dt>
            <dd>{theme.themeData.fontStyle}</dd>
          </div>
          <div>
            <dt>Reduce motion</dt>
            <dd>{theme.themeData.reduceMotion ? "yes" : "no"}</dd>
          </div>
        </dl>
      </section>

      <section className="theme-detail-actions">
        <h2>Use this theme</h2>
        <div className="theme-gallery-actions">
          {viewer ? (
            <form action={installThemeAction.bind(null, theme.id)}>
              <button type="submit" className="btn">
                Install on my page
              </button>
            </form>
          ) : (
            <Link href={`/login?next=/explore/themes/${theme.id}`} className="btn">
              Log in to install
            </Link>
          )}
          {viewer ? (
            <form action={forkThemeAction.bind(null, theme.id)}>
              <button type="submit" className="btn secondary">
                Fork and remix
              </button>
            </form>
          ) : (
            <Link href={`/login?next=/explore/themes/${theme.id}`} className="btn secondary">
              Log in to fork
            </Link>
          )}
        </div>
        <p className="explore-section-note">
          Installing copies the look to your live page. Forking creates a new gallery entry credited to you, with a link
          back here.
        </p>
      </section>

      {versions.length > 0 && (
        <section className="theme-version-history">
          <h2>Version history</h2>
          <p className="explore-section-note">Immutable snapshots — each publish bumps the version number.</p>
          <ol className="theme-version-list">
            {versions.map((v) => (
              <li key={v.version} className="theme-version-item">
                <span className="mono theme-version-number">v{v.version}</span>
                <time className="mono theme-version-date" dateTime={v.createdAt}>
                  {formatDate(v.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="theme-report-section">
        <h2>Report</h2>
        <p className="explore-section-note">Unsafe colors, impersonation, or something else off — tell moderators.</p>
        <ThemeReportForm themeId={theme.id} />
      </section>

      <p className="explore-back">
        <Link href="/explore/themes">Back to theme gallery</Link>
      </p>
    </main>
  );
}
