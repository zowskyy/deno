import { notFound } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import { findUserByHandle } from "@/lib/auth";
import { getEffectiveDocument, getMiniPage, getPageDocument } from "@/lib/pageDocument";
import { hasBlockRelationship } from "@/lib/friends";
import { getCurrentUser } from "@/lib/session";
import { readableTextFor } from "@/lib/color";
import { parseHandleParam } from "@/lib/handleParam";

interface Props {
  params: Promise<{ handle: string; slug: string }>;
  searchParams: Promise<{ reader?: string; preview?: string }>;
}

export default async function MiniPageViewer({ params, searchParams }: Props) {
  const { handle: rawParam, slug } = await params;
  const { reader, preview } = await searchParams;

  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const stored = getPageDocument(user.id);
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === user.id;

  const blocked = viewer && !isOwner && hasBlockRelationship(viewer.id, user.id);
  const visible = stored && (stored.isPublished || isOwner) && !blocked;
  if (!visible) notFound();

  const readerMode = reader === "1";
  const safePreview = preview === "1";
  const document = getEffectiveDocument(stored!, isOwner, safePreview);
  const miniPage = getMiniPage(document, slug);
  if (!miniPage) notFound();

  const { ink, inkSoft } = readableTextFor(document.theme.background);

  const themeStyle: CSSProperties = readerMode
    ? {}
    : ({
        "--page-accent": document.theme.accent,
        "--page-bg": document.theme.background,
        "--page-ink": ink,
        "--page-ink-soft": inkSoft,
      } as CSSProperties);

  const bodyClasses = [
    "page-body",
    "mini-page-view",
    readerMode ? "reader-mode" : null,
    readerMode ? null : `density-${document.theme.density}`,
    readerMode ? null : `font-${document.theme.fontStyle}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className="top-bar">
        <span>
          webroom / @{user.handle}
          {isOwner && !stored!.isPublished && (
            <span className="mono" style={{ color: "var(--accent)" }}> · draft, not published</span>
          )}
          {isOwner && safePreview && stored!.draftDocument && (
            <span className="mono" style={{ color: "var(--accent)" }}> · previewing draft</span>
          )}
        </span>
        <div className="controls">
          {isOwner && stored!.draftDocument && (
            <Link href={safePreview ? `/@${user.handle}/p/${slug}` : `/@${user.handle}/p/${slug}?preview=1`}>
              {safePreview ? "Live page" : "Preview draft"}
            </Link>
          )}
          <Link href={readerMode ? `/@${user.handle}/p/${slug}` : `/@${user.handle}/p/${slug}?reader=1`}>
            {readerMode ? "Exit Reader" : "Reader"}
          </Link>
          <Link href={`/@${user.handle}`}>Back to page</Link>
          {!isOwner && <Link href={`/@${user.handle}/report`}>Report</Link>}
          {!isOwner && <Link href={`/@${user.handle}/block`}>Block</Link>}
        </div>
      </div>

      <article
        className={bodyClasses}
        style={themeStyle}
        data-template={readerMode ? undefined : document.theme.template}
      >
        <header className="mini-page-header">
          <h1>{miniPage.title}</h1>
          {miniPage.intro && <p className="mini-page-intro-lead">{miniPage.intro}</p>}
          <p className="mini-page-meta mono">
            <Link href={`/@${user.handle}`}>@{user.handle}</Link>
          </p>
        </header>
        {miniPage.body && (
          <div className="mini-page-body part-body">
            {miniPage.body.split("\n").map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        )}
        <p className="page-footer mono">
          <Link href={`/@${user.handle}`}>@{user.handle}</Link> on Webroom
        </p>
      </article>
    </>
  );
}
