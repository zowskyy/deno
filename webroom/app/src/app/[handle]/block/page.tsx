import { notFound } from "next/navigation";
import Link from "next/link";
import { findUserByHandle } from "@/lib/auth";
import { parseHandleParam } from "@/lib/handleParam";
import { blockAction } from "./actions";

interface Props {
  params: Promise<{ handle: string }>;
}

export default async function BlockConfirmPage({ params }: Props) {
  const { handle: rawParam } = await params;
  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const boundAction = blockAction.bind(null, handle);

  return (
    <main className="container">
      <h1>Block @{handle}?</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        You won&apos;t see their page anymore, and they can&apos;t send you a friend request. This ends any
        existing friend link between you. You can{" "}
        <Link href="/settings">unblock later from your settings</Link>.
      </p>
      <form action={boundAction}>
        <button type="submit" className="btn">
          Block @{handle}
        </button>
      </form>
    </main>
  );
}
