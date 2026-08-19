import { notFound } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import { findUserByHandle } from "@/lib/auth";
import { canViewPage, getEffectiveDocument, getPageDocument } from "@/lib/pageDocument";
import { hasBlockRelationship } from "@/lib/friends";
import { getCurrentUser } from "@/lib/session";
import { readableTextFor } from "@/lib/color";
import { parseHandleParam } from "@/lib/handleParam";

interface Props {
  params: Promise<{ handle: string; slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default async function BlogPostPage({ params, searchParams }: Props) {
  const { handle: rawParam, slug } = await params;
  const { preview } = await searchParams;

  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const stored = getPageDocument(user.id);
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === user.id;

  const blocked = viewer && !isOwner && hasBlockRelationship(viewer.id, user.id);
  if (blocked || !canViewPage(stored, user.id, viewer?.id ?? null)) notFound();

  const safePreview = preview === "1";
  const document = getEffectiveDocument(stored!, isOwner, safePreview);
  const post = document.blog.find((p) => p.slug === slug);
  if (!post) notFound();

  const { ink, inkSoft } = readableTextFor(document.theme.background);

  const themeStyle = {
    "--page-accent": document.theme.accent,
    "--page-bg": document.theme.background,
    "--page-ink": ink,
    "--page-ink-soft": inkSoft,
  } as CSSProperties;

  return (
    <>
      <div className="top-bar">
        <span className="mono">webroom / @{user.handle} / blog</span>
        <div className="controls">
          <Link href={`/@${user.handle}`}>Back to page</Link>
        </div>
      </div>

      <article
        className={`page-body blog-post density-${document.theme.density} font-${document.theme.fontStyle}`}
        style={themeStyle}
        data-template={document.theme.template}
      >
        <header className="blog-post-header">
          <h1>{post.title}</h1>
          <p className="blog-post-meta mono">
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            <span className="blog-post-sep"> · </span>
            <Link href={`/@${user.handle}`}>@{user.handle}</Link>
          </p>
        </header>
        <div className="blog-post-body part-body">
          {post.body.split("\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        <p className="page-footer mono">
          <Link href={`/@${user.handle}`}>@{user.handle}</Link> on Webroom
        </p>
      </article>
    </>
  );
}
