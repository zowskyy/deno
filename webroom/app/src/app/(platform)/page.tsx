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
      <p className="home-lead">
        A personal-page platform where you get lost in the customization — without getting lost in it.
        Friend links, guestbooks, shrines, pixel art, themes: your imagination is the only limit.
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

      <section className="home-explore" aria-label="Explore highlights">
        <h2 style={{ marginTop: "2.5rem" }}>Wander without a feed</h2>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", marginBottom: "1rem" }}>
          Explore is live — tags, templates, web rings, collections, friend-graph walks, search, and a surprise button.
        </p>
        <ul className="home-explore-list">
          <li>
            <Link href="/explore">Recently redecorated</Link>
            <span className="home-explore-desc">See what people just published</span>
          </li>
          <li>
            <Link href="/explore">Browse by tag &amp; feeling</Link>
            <span className="home-explore-desc">Follow a tag or template mood</span>
          </li>
          <li>
            <Link href="/explore/random">Surprise me</Link>
            <span className="home-explore-desc">Land on a random public page</span>
          </li>
          <li>
            <Link href="/explore">Web rings &amp; collections</Link>
            <span className="home-explore-desc">Curated lists and classic webring hops</span>
          </li>
          <li>
            <Link href="/explore">Friend graph walks</Link>
            <span className="home-explore-desc">Follow friend links one or two hops out</span>
          </li>
        </ul>
      </section>
    </main>
  );
}
