import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";

// The four screens plus feed, messages, marketplace, and instance settings.
export async function SiteNav() {
  const viewer = await getCurrentUser();
  const moderator = viewer ? isModerator(viewer.id) : false;

  return (
    <div className="top-bar">
      <Link href="/" className="mono" style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 700 }}>
        ✦ WEBROOM
      </Link>
      <nav className="controls">
        <Link href="/explore">Explore</Link>
        <Link href="/feed">Feed</Link>
        <Link href="/make">Make</Link>
        <Link href="/policy">Policy</Link>
        {viewer ? (
          <>
            <Link href={`/@${viewer.handle}`}>My Page</Link>
            <Link href="/studio">Studio</Link>
            <Link href="/messages">Messages</Link>
            <Link href="/marketplace">Plugins</Link>
            <Link href="/instance">Instance</Link>
            <Link href="/settings">Settings</Link>
            {moderator && <Link href="/moderation">Moderation</Link>}
            <form action="/logout" method="post" style={{ display: "inline" }}>
              <button type="submit">Log out</button>
            </form>
          </>
        ) : (
          <Link href="/login">Log in</Link>
        )}
      </nav>
    </div>
  );
}
