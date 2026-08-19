import { notFound } from "next/navigation";
import Link from "next/link";
import { findUserByHandle } from "@/lib/auth";
import { getPageDocument } from "@/lib/pageDocument";
import { hasBlockRelationship, listFriends } from "@/lib/friends";
import { getCurrentUser } from "@/lib/session";
import { PageRenderer } from "@/components/PageRenderer";
import { parseHandleParam } from "@/lib/handleParam";

interface Props {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ reader?: string }>;
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { handle: rawParam } = await params;
  const { reader } = await searchParams;

  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const stored = getPageDocument(user.id);
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === user.id;

  // A block (in either direction) hides the page from that one viewer
  // only — nobody else's access changes, and the blocked party never
  // gets a distinguishable error telling them specifically that they've
  // been blocked (same "not found" as any other inaccessible page).
  const blocked = viewer && !isOwner && hasBlockRelationship(viewer.id, user.id);

  // Never leak whether a page exists-but-is-private vs. genuinely
  // doesn't exist to a stranger — both render the same "not found."
  // The owner previewing their own unpublished page is the one
  // exception, so they can always see what they're about to publish.
  const visible = stored && (stored.isPublished || isOwner) && !blocked;
  if (!visible) notFound();

  const readerMode = reader === "1";
  const friends = listFriends(user.id);

  return (
    <>
      <div className="top-bar">
        <span>
          webroom / @{user.handle}
          {isOwner && !stored!.isPublished && <span className="mono" style={{ color: "var(--accent)" }}> · draft, not published</span>}
        </span>
        <div className="controls">
          <Link href={readerMode ? `/@${user.handle}` : `/@${user.handle}?reader=1`}>
            {readerMode ? "Exit Reader" : "Reader"}
          </Link>
          {!isOwner && <Link href={`/@${user.handle}/report`}>Report</Link>}
          {!isOwner && <Link href={`/@${user.handle}/block`}>Block</Link>}
        </div>
      </div>
      <PageRenderer document={stored!.document} friends={friends} handle={user.handle} readerMode={readerMode} />
    </>
  );
}
