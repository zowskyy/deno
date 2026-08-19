import { NextResponse } from "next/server";
import { readAssetFile, getUserAsset } from "@/lib/assets";

/** Serve a hosted user asset by id. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const asset = getUserAsset(id);
  if (!asset) return new NextResponse("Not found", { status: 404 });

  const file = readAssetFile(id);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(file.buffer, {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
