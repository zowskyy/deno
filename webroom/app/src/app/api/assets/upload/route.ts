import { NextResponse } from "next/server";
import { storeUserAsset, AssetError } from "@/lib/assets";
import { getCurrentUser } from "@/lib/session";

/** Upload a hosted image or audio file for the logged-in user. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in to upload files." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const asset = storeUserAsset(user.id, buffer, file.type || "application/octet-stream", file.name);
    return NextResponse.json({
      ok: true,
      assetId: asset.id,
      kind: asset.kind,
      url: `/api/assets/${asset.id}`,
    });
  } catch (error) {
    if (error instanceof AssetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
