import { notFound } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import { parseHandleParam } from "@/lib/handleParam";
import { ReportForm } from "./ReportForm";

interface Props {
  params: Promise<{ handle: string }>;
}

export default async function ReportPage({ params }: Props) {
  const { handle: rawParam } = await params;
  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  return (
    <main className="container">
      <h1>Report @{handle}</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Reports go to Webroom&apos;s moderation queue. You don&apos;t need an account to file one.
      </p>
      <ReportForm handle={handle} />
    </main>
  );
}
