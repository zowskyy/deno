import Link from "next/link";
import { AppealForm } from "./AppealForm";

export default function AppealPage() {
  return (
    <main className="container" style={{ maxWidth: "32rem" }}>
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Appeals
      </p>
      <h1>Appeal a platform block</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        If your account was platform-blocked, you can ask moderators to review the decision. Sign in with your
        handle and password to verify it&apos;s you — you won&apos;t get a normal session until the block is lifted.
      </p>
      <p style={{ fontSize: "0.9rem" }}>
        <Link href="/policy">Policy</Link>
        {" · "}
        <Link href="/appeal">Appeal a block</Link>
      </p>

      <AppealForm />

      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/">Back home</Link>
      </p>
    </main>
  );
}
