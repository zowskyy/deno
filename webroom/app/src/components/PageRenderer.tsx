import type { PageDocument } from "@/lib/pageDocumentTypes";
import type { FriendSummary } from "@/lib/friends";
import type { GuestbookEntry } from "@/lib/guestbook";
import { readableTextFor } from "@/lib/color";
import { profileScopeClass, validateProfileCustomCss } from "@/lib/cssScope";
import { renderPagePart, renderPagePlugins, type TopEightLink } from "@/lib/moduleRegistry";

export type { TopEightLink };

interface Props {
  document: PageDocument;
  friends: FriendSummary[];
  handle: string;
  readerMode: boolean;
  guestbookEntries: GuestbookEntry[];
  topEightLinks: TopEightLink[];
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
  const scopeClass = profileScopeClass(handle);

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
    scopeClass,
    readerMode ? "reader-mode" : null,
    readerMode ? null : `density-${document.theme.density}`,
    readerMode ? null : `font-${document.theme.fontStyle}`,
    !readerMode && document.theme.reduceMotion ? "reduce-motion" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const scopedCss =
    !readerMode && document.theme.customCssEnabled && document.theme.customCss
      ? (() => {
          const validated = validateProfileCustomCss(document.theme.customCss, handle);
          return validated.ok ? validated.css : "";
        })()
      : "";

  const ctx = { document, handle, readerMode, friends, guestbookEntries, topEightLinks };

  return (
    <div className={bodyClasses} style={themeStyle} data-template={readerMode ? undefined : document.theme.template}>
      {document.theme.attribution?.credit && !readerMode && (
        <p className="theme-attribution mono">{document.theme.attribution.credit}</p>
      )}
      {scopedCss && <style>{scopedCss}</style>}
      {document.pageParts.map((partId) => renderPagePart(partId, ctx))}
      {renderPagePlugins(document)}
      <p className="page-footer mono">@{handle} on Webroom</p>
    </div>
  );
}
