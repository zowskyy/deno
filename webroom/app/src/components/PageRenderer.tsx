import Link from "next/link";
import type { PageDocument } from "@/lib/pageDocument";
import type { FriendSummary } from "@/lib/friends";
import type { GuestbookEntry } from "@/lib/guestbook";
import { readableTextFor } from "@/lib/color";

export interface TopEightLink {
  handle: string;
  label: string;
}

interface Props {
  document: PageDocument;
  friends: FriendSummary[];
  handle: string;
  readerMode: boolean;
  guestbookEntries: GuestbookEntry[];
  topEightLinks: TopEightLink[];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function PageRenderer({
  document,
  friends,
  handle,
  readerMode,
  guestbookEntries,
  topEightLinks,
}: Props) {
  const { ink, inkSoft } = readableTextFor(document.theme.background);

  const themeStyle: React.CSSProperties = readerMode
    ? {}
    : ({
        "--page-accent": document.theme.accent,
        "--page-bg": document.theme.background,
        "--page-ink": ink,
        "--page-ink-soft": inkSoft,
      } as React.CSSProperties);

  const bodyClasses = [
    "page-body",
    readerMode ? "reader-mode" : null,
    readerMode ? null : `density-${document.theme.density}`,
    readerMode ? null : `font-${document.theme.fontStyle}`,
    !readerMode && document.theme.reduceMotion ? "reduce-motion" : null,
  ]
    .filter(Boolean)
    .join(" ");

  function renderPart(partId: string) {
    switch (partId) {
      case "identity":
        return (
          <section key="identity" className="page-identity page-part">
            <h1>{document.identity.displayName}</h1>
            {document.identity.status && <p className="page-status">{document.identity.status}</p>}
            {document.identity.bio && <p className="page-bio">{document.identity.bio}</p>}
          </section>
        );

      case "now":
        if (!document.now) return null;
        return (
          <section key="now" className="page-part page-now" aria-label="Now">
            <h2 className="part-label">Now</h2>
            <p className="part-body">{document.now}</p>
          </section>
        );

      case "links":
        if (document.links.length === 0) return null;
        return (
          <nav key="links" className="page-part page-links-section" aria-label="Links">
            <h2 className="part-label">Links</h2>
            <ul className="page-links">
              {document.links.map((link, i) => (
                <li key={i}>
                  <a href={link.url} rel="ugc noopener noreferrer" target="_blank">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        );

      case "gallery":
        if (document.gallery.length === 0) return null;
        return (
          <section key="gallery" className="page-part page-gallery" aria-label="Gallery">
            <h2 className="part-label">Gallery</h2>
            <ul className="gallery-grid">
              {document.gallery.map((item) => (
                <li key={item.id} className="gallery-item">
                  <img src={item.url} alt={item.alt} className="gallery-image" />
                  {item.caption && <p className="gallery-caption">{item.caption}</p>}
                </li>
              ))}
            </ul>
          </section>
        );

      case "blog":
        if (document.blog.length === 0) return null;
        const sortedBlog = [...document.blog].sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
        );
        return (
          <section key="blog" className="page-part page-blog" aria-label="Blog">
            <h2 className="part-label">Blog</h2>
            <ul className="blog-list">
              {sortedBlog.map((post) => (
                <li key={post.id} className="blog-item">
                  <Link href={`/@${handle}/blog/${post.slug}`} className="blog-link">
                    <span className="blog-title">{post.title}</span>
                    <time className="blog-date mono" dateTime={post.publishedAt}>
                      {formatDate(post.publishedAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );

      case "devlog":
        if (document.devlog.length === 0) return null;
        const sortedDevlog = [...document.devlog].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        return (
          <section key="devlog" className="page-part page-devlog" aria-label="Devlog">
            <h2 className="part-label">Devlog</h2>
            <ul className="devlog-list">
              {sortedDevlog.map((entry) => (
                <li key={entry.id} className="devlog-item">
                  <time className="devlog-date mono" dateTime={entry.date}>{formatDate(entry.date)}</time>
                  <p className="devlog-body">{entry.body}</p>
                </li>
              ))}
            </ul>
          </section>
        );

      case "guestbook":
        if (guestbookEntries.length === 0) return null;
        return (
          <section key="guestbook" className="page-part page-guestbook" aria-label="Guestbook">
            <h2 className="part-label">Guestbook</h2>
            <ul className="guestbook-entries">
              {guestbookEntries.map((entry) => (
                <li key={entry.id} className="guestbook-entry">
                  <p className="guestbook-message">{entry.message}</p>
                  <p className="guestbook-meta mono">
                    {entry.authorHandle ? `@${entry.authorHandle}` : "Anonymous"}
                    <span className="guestbook-sep"> · </span>
                    <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );

      case "friends":
        return (
          <section key="friends" className="page-part page-friends-section" aria-label="Friends">
            <h2 className="part-label">Friends ({friends.length})</h2>
            {friends.length === 0 ? (
              <p className="empty-note">No friends listed yet.</p>
            ) : (
              <ul className="page-friends">
                {friends.map((f) => (
                  <li key={f.userId}>
                    <Link href={`/@${f.handle}`}>@{f.handle}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );

      case "topEight":
        if (topEightLinks.length === 0) return null;
        return (
          <section key="topEight" className="page-part page-top-eight" aria-label="Top 8">
            <h2 className="part-label">Top 8</h2>
            <ul className="top-eight-grid">
              {topEightLinks.map((link) => (
                <li key={link.handle}>
                  <Link href={`/@${link.handle}`} className="top-eight-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );

      case "badges":
        if (document.badges.length === 0) return null;
        return (
          <section key="badges" className="page-part page-badges" aria-label="Badges">
            <h2 className="part-label">Badges</h2>
            <ul className="badge-list">
              {document.badges.map((badge) => (
                <li key={badge.id} className="badge-item">
                  {badge.emoji && <span className="badge-emoji" aria-hidden="true">{badge.emoji}</span>}
                  <span className="badge-label">{badge.label}</span>
                </li>
              ))}
            </ul>
          </section>
        );

      default:
        return null;
    }
  }

  return (
    <div
      className={bodyClasses}
      style={themeStyle}
      data-template={readerMode ? undefined : document.theme.template}
    >
      {document.pageParts.map((partId) => renderPart(partId))}
      <p className="page-footer mono">@{handle} on Webroom</p>
    </div>
  );
}
