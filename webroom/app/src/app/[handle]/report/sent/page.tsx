import Link from "next/link";

export default function ReportSentPage() {
  return (
    <main className="container">
      <h1>Report sent</h1>
      <p>Thanks — this has been added to the moderation queue.</p>
      <Link href="/explore" className="btn secondary">
        Back to Explore
      </Link>
    </main>
  );
}
