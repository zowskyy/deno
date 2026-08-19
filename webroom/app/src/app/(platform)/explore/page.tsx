import Link from "next/link";
import { listRecentlyPublished } from "@/lib/discovery";

export default function ExplorePage() {
  const pages = listRecentlyPublished();

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Explore
      </p>
      <h1>Recently redecorated</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Tags, web rings, and wandering by friend links come later — for now, here&apos;s what people just published.
      </p>

      {pages.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>No pages published yet. Be the first.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: "1.5rem 0 0", padding: 0, display: "grid", gap: "0.75rem" }}>
          {pages.map((p) => (
            <li key={p.handle} style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "0.9rem 1.1rem" }}>
              <Link href={`/@${p.handle}`} style={{ fontWeight: 600 }}>
                {p.displayName}
              </Link>
              <span className="mono" style={{ color: "var(--ink-soft)", marginLeft: "0.6rem", fontSize: "0.85rem" }}>
                @{p.handle}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
