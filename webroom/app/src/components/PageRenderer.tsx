import type { PageDocument } from "@/lib/pageDocument";
import type { FriendSummary } from "@/lib/friends";
import { readableTextFor } from "@/lib/color";

interface Props {
  document: PageDocument;
  friends: FriendSummary[];
  handle: string;
  readerMode: boolean;
}

// Renders a page document as HTML. This is the one place a theme's
// chosen colors ever reach the page — always as CSS custom properties
// fed from already-validated hex strings (PageDocumentSchema's hexColor
// regex), never as raw text a visitor's browser could interpret as
// markup, script, or a stylesheet escape.
export function PageRenderer({ document, friends, handle, readerMode }: Props) {
  // Text color is derived from the PAGE's own background, not the
  // visitor's OS light/dark preference — those are independent, and
  // conflating them produced a real bug: a dark theme viewed in a
  // light-mode browser rendered near-invisible dark-on-dark text.
  const { ink, inkSoft } = readableTextFor(document.theme.background);

  const themeStyle: React.CSSProperties = readerMode
    ? {}
    : ({
        "--page-accent": document.theme.accent,
        "--page-bg": document.theme.background,
        "--page-ink": ink,
        "--page-ink-soft": inkSoft,
      } as React.CSSProperties);

  return (
    <div
      className={readerMode ? "page-body reader-mode" : "page-body"}
      style={themeStyle}
      data-template={readerMode ? undefined : document.theme.template}
    >
      <section className="page-identity">
        <h1>{document.identity.displayName}</h1>
        {document.identity.status && <p className="page-status">{document.identity.status}</p>}
        {document.identity.bio && <p className="page-bio">{document.identity.bio}</p>}
      </section>

      {document.pageParts.includes("now") && document.now && (
        <section aria-label="Now">
          <h2 className="part-label">Now</h2>
          <p>{document.now}</p>
        </section>
      )}

      {document.pageParts.includes("links") && document.links.length > 0 && (
        <nav aria-label="Links">
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
      )}

      {document.pageParts.includes("friends") && (
        <section aria-label="Friends">
          <h2 className="part-label">Friends ({friends.length})</h2>
          {friends.length === 0 ? (
            <p className="empty-note">No friends listed yet.</p>
          ) : (
            <ul className="page-friends">
              {friends.map((f) => (
                <li key={f.userId}>
                  <a href={`/@${f.handle}`}>@{f.handle}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="page-footer mono">@{handle} on Webroom</p>
    </div>
  );
}
