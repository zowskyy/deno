import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getPageDocument } from "@/lib/pageDocument";

// The full five-tab Studio (Look/Layout/Content/Access/Publish) is
// Phase 2. This is a real, working placeholder — not a dead link — so
// there's always somewhere honest to land: shows what's actually live,
// and the one thing you genuinely can do today (re-run Make) rather
// than pretending the editing surface exists yet.
export default async function StudioPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  const stored = getPageDocument(viewer.id);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Studio
      </p>
      <h1>Shaping your page comes in Phase 2</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        The full Studio — Look, Layout, Content, Access, Publish tabs, undo, and version history — isn&apos;t built
        yet. For now you can redo the guided Make flow to change your template, name, bio, and which parts show.
      </p>

      {stored && (
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "1rem", margin: "1.25rem 0" }}>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-soft)" }}>Currently live:</p>
          <p style={{ margin: "0.25rem 0 0", fontWeight: 600 }}>{stored.document.identity.displayName}</p>
          <p className="mono" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
            {stored.document.theme.template} · {stored.isPublished ? "published" : "draft"}
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Link href="/make" className="btn">
          Redo Make flow
        </Link>
        {stored?.isPublished && (
          <Link href={`/@${viewer.handle}`} className="btn secondary">
            View your page
          </Link>
        )}
      </div>
    </main>
  );
}
