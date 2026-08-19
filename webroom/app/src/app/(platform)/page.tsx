import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

export default async function HomePage() {
  const viewer = await getCurrentUser();

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Webroom
      </p>
      <h1>Make your corner of the internet. Keep it yours.</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: "1.05rem" }}>
        A personal-page platform with friend links, guestbooks, badges, and no feed. What does your corner of the
        internet feel like?
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
        {viewer ? (
          <>
            <Link href={`/@${viewer.handle}`} className="btn">
              View your page
            </Link>
            <Link href="/explore" className="btn secondary">
              Explore
            </Link>
          </>
        ) : (
          <>
            <Link href="/signup" className="btn">
              Make your page
            </Link>
            <Link href="/explore" className="btn secondary">
              Explore first
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
