import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureSeedRings, getWebRingBySlug, listRingMembers } from "@/lib/webRings";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ at?: string }>;
}

export default async function ExploreRingPage({ params, searchParams }: Props) {
  ensureSeedRings();

  const { slug } = await params;
  const { at } = await searchParams;

  const ring = getWebRingBySlug(slug);
  if (!ring) notFound();

  const members = listRingMembers(ring.id);
  const atHandle = at?.replace(/^@/, "").trim().toLowerCase() ?? members[0]?.handle;
  const currentIndex = members.findIndex((m) => m.handle === atHandle);
  const idx = currentIndex >= 0 ? currentIndex : 0;
  const current = members[idx];
  const prev = idx > 0 ? members[idx - 1]! : null;
  const next = idx < members.length - 1 ? members[idx + 1]! : null;

  return (
    <main className="container explore-container">
      <p className="mono explore-kicker">
        <Link href="/explore">Explore</Link> / web ring
      </p>
      <h1>{ring.name}</h1>
      <p className="explore-lead">{ring.description}</p>

      {members.length === 0 ? (
        <p className="explore-empty">This ring has no public members yet.</p>
      ) : (
        <>
          {current && (
            <section className="explore-ring-walk" aria-label="Walk the ring">
              <h2 className="explore-ring-walk-label">Now visiting</h2>
              <div className="explore-ring-walk-card">
                <p className="explore-ring-walk-name">{current.displayName}</p>
                <p className="mono explore-ring-walk-handle">@{current.handle}</p>
                <div className="explore-ring-nav">
                  {prev ? (
                    <Link
                      href={`/explore/ring/${ring.slug}?at=${prev.handle}`}
                      className="btn secondary explore-ring-nav-btn"
                    >
                      ← {prev.displayName}
                    </Link>
                  ) : (
                    <span className="explore-ring-nav-disabled">← Start of ring</span>
                  )}
                  <Link href={`/@${current.handle}`} className="btn">Visit page</Link>
                  {next ? (
                    <Link
                      href={`/explore/ring/${ring.slug}?at=${next.handle}`}
                      className="btn secondary explore-ring-nav-btn"
                    >
                      {next.displayName} →
                    </Link>
                  ) : (
                    <span className="explore-ring-nav-disabled">End of ring →</span>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="explore-section">
            <h2>All members</h2>
            <ul className="explore-ring-members">
              {members.map((m, i) => (
                <li key={m.handle} className={m.handle === current?.handle ? "explore-ring-member-active" : undefined}>
                  <span className="mono explore-ring-position">{i + 1}</span>
                  <Link href={`/@${m.handle}`}>{m.displayName}</Link>
                  <span className="mono explore-template-handle">@{m.handle}</span>
                  <Link href={`/explore/ring/${ring.slug}?at=${m.handle}`} className="explore-ring-walk-link">
                    Walk here
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="explore-back">
        <Link href="/explore">Back to Explore</Link>
      </p>
    </main>
  );
}
