import Link from "next/link";
import { parseHandleParam } from "@/lib/handleParam";

interface Props {
  params: Promise<{ handle: string }>;
}

export default async function BlockDonePage({ params }: Props) {
  const { handle: rawParam } = await params;
  const handle = parseHandleParam(rawParam) ?? rawParam;

  return (
    <main className="container">
      <h1>@{handle} is blocked</h1>
      <p>You won&apos;t see their page, and they can&apos;t friend-request you.</p>
      <Link href="/explore" className="btn secondary">
        Back to Explore
      </Link>
    </main>
  );
}
