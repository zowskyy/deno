import { notFound } from "next/navigation";
import Link from "next/link";
import { findUserByHandle } from "@/lib/auth";
import { getEffectiveDocument, getPageDocument } from "@/lib/pageDocument";
import {
  getFriendRelationship,
  hasBlockRelationship,
  listPublicFriends,
} from "@/lib/friends";
import { listApprovedGuestbookEntries } from "@/lib/guestbook";
import { getCurrentUser } from "@/lib/session";
import { listUserWebRings } from "@/lib/webRings";
import { PageRenderer, type TopEightLink } from "@/components/PageRenderer";
import { parseHandleParam } from "@/lib/handleParam";
import { FriendActions } from "./friends/FriendActions";
import { GuestbookSignForm } from "./guestbook/GuestbookSignForm";

interface Props {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ reader?: string; preview?: string }>;
}

function resolveTopEight(handles: string[]): TopEightLink[] {
  const links: TopEightLink[] = [];
  for (const raw of handles) {
    const user = findUserByHandle(raw);
    if (!user) continue;
    const page = getPageDocument(user.id);
    if (!page?.isPublished) continue;
    links.push({
      handle: user.handle,
      label: page.document.identity.displayName,
    });
  }
  return links;
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { handle: rawParam } = await params;
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

  const viewerId = viewer?.id ?? null;
  const friends = listPublicFriends(user.id, viewerId);
  const theirFriends = listPublicFriends(user.id, viewerId);
  const guestbookEntries = listApprovedGuestbookEntries(user.id);
  const topEightLinks = resolveTopEight(document.topEight);
  const rings = listUserWebRings(user.id);

  const relationship = viewer && !isOwner ? getFriendRelationship(viewer.id, user.id) : null;

  const showGuestbookForm =
    document.guestbook.enabled && !stored!.guestbookDisabled && !isOwner;

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
            <Link href={safePreview ? `/@${user.handle}` : `/@${user.handle}?preview=1`}>
              {safePreview ? "Live page" : "Preview draft"}
            </Link>
          )}
          <Link href={readerMode ? `/@${user.handle}` : `/@${user.handle}?reader=1`}>
            {readerMode ? "Exit Reader" : "Reader"}
          </Link>
          {!isOwner && <Link href={`/@${user.handle}/report`}>Report</Link>}
          {!isOwner && <Link href={`/@${user.handle}/block`}>Block</Link>}
        </div>
      </div>

      {rings.length > 0 && (
        <div className="ring-badges-bar">
          {rings.map((ring) => (
            <span key={ring.id} className="ring-badge mono" title={ring.description}>
              ✦ {ring.name}
            </span>
          ))}
        </div>
      )}

      {relationship && (
        <div className="profile-actions-bar">
          <FriendActions handle={user.handle} relationship={relationship} />
        </div>
      )}

      <PageRenderer
        document={document}
        friends={friends}
        handle={user.handle}
        readerMode={readerMode}
        guestbookEntries={guestbookEntries}
        topEightLinks={topEightLinks}
      />

      {showGuestbookForm && <GuestbookSignForm handle={user.handle} />}

      {theirFriends.length > 0 && (
        <section className="their-friends container-narrow" aria-label="Their friends">
          <h2 className="part-label">Their friends</h2>
          <p className="their-friends-hint">Wander the graph — people @{user.handle} is connected to.</p>
          <ul className="page-friends their-friends-list">
            {theirFriends.map((f) => (
              <li key={f.userId}>
                <Link href={`/@${f.handle}`}>@{f.handle}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
