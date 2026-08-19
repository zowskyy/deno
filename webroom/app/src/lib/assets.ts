import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Error thrown when an upload fails validation or storage. */
export class AssetError extends Error {}

/** Allowed MIME types for image uploads. */
export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
/** Allowed MIME types for audio uploads. */
export const AUDIO_MIMES = new Set(["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"]);

/** Stored user asset metadata. */
export interface UserAsset {
  id: string;
  userId: string;
  kind: "image" | "audio";
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
}

/** Resolve the filesystem directory for hosted uploads. */
export function getUploadDir(): string {
  const dir = process.env.WEBROOM_UPLOAD_DIR ?? join(__dirname, "..", "..", "uploads");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Maximum upload size in bytes (default 5MB images, 15MB audio). */
export function maxUploadBytes(kind: "image" | "audio"): number {
  const env = process.env.WEBROOM_MAX_UPLOAD_BYTES;
  if (env) {
    const bytes = Number(env);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      return kind === "audio" ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
    }
    return bytes;
  }
  return kind === "audio" ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
}

/** Absolute maximum request size for any upload (audio cap plus multipart overhead). */
export function maxUploadRequestBytes(): number {
  return maxUploadBytes("audio") + 256 * 1024;
}

/** Read a request body up to maxBytes; throws AssetError when exceeded. */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new AssetError("Upload exceeds maximum request size.");
  }

  if (!request.body) {
    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.length > maxBytes) throw new AssetError("Upload exceeds maximum request size.");
    return buf;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw new AssetError("Upload exceeds maximum request size.");
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Parse multipart form data from a bounded request body. */
export async function parseBoundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  const body = await readBoundedBody(request, maxBytes);
  const bytes = Uint8Array.from(body);
  const blob = new Blob([bytes], { type: contentType });
  return new Response(blob, { headers: { "content-type": contentType } }).formData();
}

/** Store an uploaded file and record metadata in the database. */
export function storeUserAsset(
  userId: string,
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): UserAsset {
  const kind = IMAGE_MIMES.has(mimeType) ? "image" : AUDIO_MIMES.has(mimeType) ? "audio" : null;
  if (!kind) throw new AssetError(`File type not allowed: ${mimeType}`);
  if (buffer.length > maxUploadBytes(kind)) {
    throw new AssetError(`File exceeds maximum size of ${maxUploadBytes(kind)} bytes.`);
  }

  const id = randomUUID();
  const ext = mimeType.split("/")[1]?.replace("x-wav", "wav") ?? "bin";
  const storagePath = join(getUploadDir(), `${id}.${ext}`);
  writeFileSync(storagePath, buffer);

  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO user_assets (id, user_id, kind, mime_type, original_name, storage_path, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, kind, mimeType, basename(originalName), storagePath, buffer.length, now);

  return {
    id,
    userId,
    kind,
    mimeType,
    originalName: basename(originalName),
    sizeBytes: buffer.length,
    createdAt: now,
  };
}

/** Load asset metadata by id. */
export function getUserAsset(assetId: string): UserAsset | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, user_id, kind, mime_type, original_name, size_bytes, created_at, storage_path
       FROM user_assets WHERE id = ?`,
    )
    .get(assetId) as
    | {
        id: string;
        user_id: string;
        kind: string;
        mime_type: string;
        original_name: string;
        size_bytes: number;
        created_at: string;
        storage_path: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind as "image" | "audio",
    mimeType: row.mime_type,
    originalName: row.original_name,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

/** Read asset file bytes from disk. */
export function readAssetFile(assetId: string): { buffer: Buffer; mimeType: string } | null {
  const db = getDb();
  const row = db
    .prepare("SELECT storage_path, mime_type FROM user_assets WHERE id = ?")
    .get(assetId) as { storage_path: string; mime_type: string } | undefined;
  if (!row || !existsSync(row.storage_path)) return null;
  return { buffer: readFileSync(row.storage_path), mimeType: row.mime_type };
}

/** Verify the viewer may reference this asset on a page (owner only). */
export function userOwnsAsset(userId: string, assetId: string): boolean {
  const asset = getUserAsset(assetId);
  return asset?.userId === userId;
}

/** Delete hosted asset files for a user before removing account metadata. */
export function purgeUserAssetFiles(userId: string): void {
  const db = getDb();
  const rows = db
    .prepare("SELECT storage_path FROM user_assets WHERE user_id = ?")
    .all(userId) as { storage_path: string }[];
  for (const row of rows) {
    if (existsSync(row.storage_path)) {
      try {
        unlinkSync(row.storage_path);
      } catch {
        throw new AssetError(`Failed to delete hosted asset file: ${row.storage_path}`);
      }
    }
  }
  db.prepare("DELETE FROM user_assets WHERE user_id = ?").run(userId);
}
