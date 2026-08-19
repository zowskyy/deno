import Link from "next/link";
import { notFound } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import { listPublicFriends } from "@/lib/friends";
import { canViewPage, getPageDocument } from "@/lib/pageDocument";
import { getCurrentUser } from "@/lib/session";

interface Props {
  params: Promise<{ handle: string }>;
}

export default async function ExploreFriendsPage({ params }: Props) {
  const { handle: rawHandle } = await params;
  const handle = rawHandle.trim().toLowerCase();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const viewer = await getCurrentUser();
  const stored = getPageDocument(user.id);
  if (!canViewPage(stored, user.id, viewer?.id ?? null)) notFound();

  const viewerId = viewer?.id ?? null;

  const friends = listPublicFriends(user.id, viewerId);

  const friendsOfFriendsMap = new Map<string, { handle: string; via: string }>();
  for (const friend of friends) {
    const theirFriends = listPublicFriends(friend.userId, viewerId);
    for (const fof of theirFriends) {
      if (fof.userId === user.id) continue;
      if (friends.some((f) => f.userId === fof.userId)) continue;
      if (!friendsOfFriendsMap.has(fof.userId)) {
        friendsOfFriendsMap.set(fof.userId, { handle: fof.handle, via: friend.handle });
      }
    }
  }
  const friendsOfFriends = [...friendsOfFriendsMap.entries()].map(([userId, meta]) => ({
    userId,
    handle: meta.handle,
    via: meta.via,
  }));

  return (
    <main className="container explore-container">
      <p className="mono explore-kicker">
        <Link href="/explore">Explore</Link> / friend graph
      </p>
      <h1>@{user.handle}&rsquo;s corner of the graph</h1>
      <p className="explore-lead">
        Walk friend links — their public friends, then one hop to their friends&rsquo; friends.
      </p>

      <section className="explore-section">
        <h2>Direct friends</h2>
        <p className="explore-section-note">Public pages only — mutual friends @{user.handle} has accepted.</p>
        {friends.length === 0 ? (
          <p className="explore-empty">No public friends to show here yet.</p>
        ) : (
          <ul className="explore-friend-list">
            {friends.map((f) => (
              <li key={f.userId} className="explore-friend-item">
                <Link href={`/@${f.handle}`}>@{f.handle}</Link>
                <Link href={`/explore/friends/${f.handle}`} className="explore-friend-walk">
                  Walk their graph
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="explore-section">
        <h2>One hop further</h2>
        <p className="explore-section-note">Friends of @{user.handle}&rsquo;s friends — still public, still your choice to wander.</p>
        {friendsOfFriends.length === 0 ? (
          <p className="explore-empty">No second-hop public friends to show yet.</p>
        ) : (
          <ul className="explore-friend-list">
            {friendsOfFriends.map((fof) => (
              <li key={fof.userId} className="explore-friend-item">
                <Link href={`/@${fof.handle}`}>@{fof.handle}</Link>
                <span className="explore-friend-via mono">via @{fof.via}</span>
                <Link href={`/explore/friends/${fof.handle}`} className="explore-friend-walk">
                  Walk their graph
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="explore-back">
        <Link href={`/@${user.handle}`}>Visit @{user.handle}&rsquo;s page</Link>
        {" · "}
        <Link href="/explore">Back to Explore</Link>
      </p>
    </main>
  );
}
