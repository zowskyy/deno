import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

// The four screens, exactly per the plan — nothing more. No feed link,
// no notifications, no marketplace.
export async function SiteNav() {
  const viewer = await getCurrentUser();

  return (
    <div className="top-bar">
      <Link href="/" className="mono" style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 700 }}>
        ✦ WEBROOM
      </Link>
      <nav className="controls">
        <Link href="/explore">Explore</Link>
        <Link href="/make">Make</Link>
        {viewer ? (
          <>
            <Link href={`/@${viewer.handle}`}>My Page</Link>
            <Link href="/studio">Studio</Link>
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
