import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getPageDocument } from "@/lib/pageDocument";
import { MakeForm } from "./MakeForm";

export default async function MakePage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/make");

  const stored = getPageDocument(viewer.id);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Step 1 of 1 · webroom.example/@{viewer.handle}
      </p>
      <h1>What does your corner of the internet feel like?</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Pick a starting mood, add a name and a sentence, choose what belongs on your page, and publish. You can
        change any of this later in the Studio.
      </p>
      <MakeForm initialDisplayName={stored?.document.identity.displayName ?? viewer.handle} />
    </main>
  );
}
