import type { ReactNode } from "react";
import Link from "next/link";
import type { PageDocument } from "./pageDocumentTypes";
import type { FriendSummary } from "./friends";
import type { GuestbookEntry } from "./guestbook";

export interface TopEightLink {
  handle: string;
  label: string;
}

export interface PageRenderContext {
  document: PageDocument;
  handle: string;
  readerMode: boolean;
  friends: FriendSummary[];
  guestbookEntries: GuestbookEntry[];
  topEightLinks: TopEightLink[];
}

export interface PageModuleDefinition {
  id: string;
  label: string;
  description: string;
  render: (ctx: PageRenderContext) => ReactNode | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function UnsupportedModule({ type }: { type: string }) {
  return (
    <section className="page-part page-unsupported" aria-label="Unsupported module">
      <p className="empty-note">This page has an unsupported section ({type}) that could not be displayed.</p>
    </section>
  );
}

export const PAGE_MODULE_REGISTRY: Record<string, PageModuleDefinition> = {
  identity: {
    id: "identity",
    label: "Identity",
    description: "Name, bio, and status",
    render: ({ document }) => (
      <section className="page-identity page-part">
        <h1>{document.identity.displayName}</h1>
        {document.identity.status && <p className="page-status">{document.identity.status}</p>}
        {document.identity.bio && <p className="page-bio">{document.identity.bio}</p>}
      </section>
    ),
  },
  now: {
    id: "now",
    label: "Now",
    description: "What you're focused on",
    render: ({ document }) =>
      document.now ? (
        <section className="page-part page-now" aria-label="Now">
          <h2 className="part-label">Now</h2>
          <p className="part-body">{document.now}</p>
        </section>
      ) : null,
  },
  links: {
    id: "links",
    label: "Links",
    description: "Curated outbound links",
    render: ({ document }) =>
      document.links.length === 0 ? null : (
        <nav className="page-part page-links-section" aria-label="Links">
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
      ),
  },
  gallery: {
    id: "gallery",
    label: "Gallery",
    description: "Images with alt text",
    render: ({ document }) =>
      document.gallery.length === 0 ? null : (
        <section className="page-part page-gallery" aria-label="Gallery">
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
      ),
  },
  blog: {
    id: "blog",
    label: "Blog",
    description: "Longer posts with permalinks",
    render: ({ document, handle }) => {
      if (document.blog.length === 0) return null;
      const sorted = [...document.blog].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
      return (
        <section className="page-part page-blog" aria-label="Blog">
          <h2 className="part-label">Blog</h2>
          <ul className="blog-list">
            {sorted.map((post) => (
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
    },
  },
  devlog: {
    id: "devlog",
    label: "Devlog",
    description: "Short dated updates",
    render: ({ document }) => {
      if (document.devlog.length === 0) return null;
      const sorted = [...document.devlog].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      return (
        <section className="page-part page-devlog" aria-label="Devlog">
          <h2 className="part-label">Devlog</h2>
          <ul className="devlog-list">
            {sorted.map((entry) => (
              <li key={entry.id} className="devlog-item">
                <time className="devlog-date mono" dateTime={entry.date}>
                  {formatDate(entry.date)}
                </time>
                <p className="devlog-body">{entry.body}</p>
              </li>
            ))}
          </ul>
        </section>
      );
    },
  },
  guestbook: {
    id: "guestbook",
    label: "Guestbook",
    description: "Approved visitor messages",
    render: ({ guestbookEntries }) =>
      guestbookEntries.length === 0 ? null : (
        <section className="page-part page-guestbook" aria-label="Guestbook">
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
      ),
  },
  friends: {
    id: "friends",
    label: "Friends",
    description: "Public friend graph",
    render: ({ friends }) => (
      <section className="page-part page-friends-section" aria-label="Friends">
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
    ),
  },
  topEight: {
    id: "topEight",
    label: "Top 8",
    description: "Curated friend highlights",
    render: ({ topEightLinks }) =>
      topEightLinks.length === 0 ? null : (
        <section className="page-part page-top-eight" aria-label="Top 8">
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
      ),
  },
  badges: {
    id: "badges",
    label: "Badges",
    description: "Sticker-like stamps",
    render: ({ document }) =>
      document.badges.length === 0 ? null : (
        <section className="page-part page-badges" aria-label="Badges">
          <h2 className="part-label">Badges</h2>
          <ul className="badge-list">
            {document.badges.map((badge) => (
              <li key={badge.id} className="badge-item">
                {badge.emoji && (
                  <span className="badge-emoji" aria-hidden="true">
                    {badge.emoji}
                  </span>
                )}
                <span className="badge-label">{badge.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ),
  },
  shrine: {
    id: "shrine",
    label: "Shrine",
    description: "A dedicated space for something you love",
    render: ({ document }) =>
      document.shrines.length === 0 ? null : (
        <section className="page-part page-shrine" aria-label="Shrines">
          <h2 className="part-label">Shrines</h2>
          <ul className="shrine-list">
            {document.shrines.map((shrine) => (
              <li key={shrine.id} className="shrine-item profile-panel">
                <h3 className="shrine-title">{shrine.title}</h3>
                {shrine.imageUrl && (
                  <img src={shrine.imageUrl} alt={shrine.imageAlt ?? shrine.title} className="shrine-image" />
                )}
                <p className="shrine-body">{shrine.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ),
  },
  playlist: {
    id: "playlist",
    label: "Playlist",
    description: "Outbound audio links — no autoplay",
    render: ({ document }) =>
      document.playlist.length === 0 ? null : (
        <section className="page-part page-playlist" aria-label="Playlist">
          <h2 className="part-label">Playlist</h2>
          <p className="studio-hint page-playlist-note">Links only — tap to listen elsewhere. No autoplay.</p>
          <ol className="playlist-list">
            {document.playlist.map((track, i) => (
              <li key={track.id}>
                <a href={track.url} rel="ugc noopener noreferrer" target="_blank">
                  {i + 1}. {track.title}
                </a>
              </li>
            ))}
          </ol>
        </section>
      ),
  },
  pixelArt: {
    id: "pixelArt",
    label: "Pixel Art",
    description: "Small owner-made pixel grids",
    render: ({ document }) =>
      document.pixelArt.length === 0 ? null : (
        <section className="page-part page-pixel-art" aria-label="Pixel art">
          <h2 className="part-label">Pixel Art</h2>
          <ul className="pixel-art-list">
            {document.pixelArt.map((piece) => (
              <li key={piece.id} className="pixel-art-item">
                {piece.title && <p className="pixel-art-title">{piece.title}</p>}
                <div
                  className="pixel-art-canvas"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${piece.width}, 1fr)`,
                    width: `${piece.width * 12}px`,
                  }}
                  role="img"
                  aria-label={piece.title ?? "Pixel art piece"}
                >
                  {piece.pixels.map((color, idx) => (
                    <span
                      key={idx}
                      className="pixel-art-pixel"
                      style={{ background: color === "transparent" ? "transparent" : color }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ),
  },
  miniPages: {
    id: "miniPages",
    label: "Mini-pages",
    description: "Linked sub-pages",
    render: ({ document, handle }) =>
      document.miniPages.length === 0 ? null : (
        <section className="page-part page-mini-pages" aria-label="Mini-pages">
          <h2 className="part-label">Mini-pages</h2>
          <ul className="mini-page-list">
            {document.miniPages.map((page) => (
              <li key={page.id}>
                <Link href={`/@${handle}/p/${page.slug}`} className="mini-page-link">
                  <span className="mini-page-title">{page.title}</span>
                  {page.intro && <span className="mini-page-intro">{page.intro}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ),
  },
};

export function renderPagePart(partId: string, ctx: PageRenderContext): ReactNode | null {
  const mod = PAGE_MODULE_REGISTRY[partId];
  if (!mod) return <UnsupportedModule type={partId} />;
  try {
    return mod.render(ctx);
  } catch {
    return <UnsupportedModule type={partId} />;
  }
}

export function listPageModules(): PageModuleDefinition[] {
  return Object.values(PAGE_MODULE_REGISTRY);
}
