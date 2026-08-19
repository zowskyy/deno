import { NextResponse } from "next/server";
import { exportLocalProfile } from "@/lib/federation";

/** Federated public profile export for a local handle. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ handle: string }> },
): Promise<NextResponse> {
  const { handle } = await context.params;
  const profile = exportLocalProfile(handle.replace(/^@/, ""));
  if (!profile) return NextResponse.json({ error: "Profile not found or not public." }, { status: 404 });
  return NextResponse.json(profile);
}
