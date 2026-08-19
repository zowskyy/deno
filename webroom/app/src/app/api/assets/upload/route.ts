import { NextResponse } from "next/server";
import { maxUploadBytes, maxUploadRequestBytes, storeUserAsset, AssetError } from "@/lib/assets";
import { getCurrentUser } from "@/lib/session";

/** Upload a hosted image or audio file for the logged-in user. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in to upload files." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxUploadRequestBytes()) {
    return NextResponse.json({ error: "Upload exceeds maximum request size." }, { status: 413 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const kind = mime.startsWith("audio/") ? "audio" : "image";
  if (file.size > maxUploadBytes(kind)) {
    return NextResponse.json({ error: `File exceeds maximum size of ${maxUploadBytes(kind)} bytes.` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const asset = storeUserAsset(user.id, buffer, mime, file.name);
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
