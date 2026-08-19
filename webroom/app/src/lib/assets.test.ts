import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import {
  AssetError,
  getUserAsset,
  InvalidUploadRequestError,
  maxUploadBytes,
  maxUploadRequestBytes,
  parseBoundedFormData,
  readAssetFile,
  readBoundedBody,
  storeUserAsset,
  userOwnsAsset,
} from "./assets";

process.env.WEBROOM_DB_PATH = ":memory:";

let uploadDir = "";

beforeEach(() => {
  resetDbForTests();
  uploadDir = mkdtempSync(join(tmpdir(), "webroom-upload-"));
  process.env.WEBROOM_UPLOAD_DIR = uploadDir;
});

describe("storeUserAsset", () => {
  it("stores image files and records metadata", () => {
    const user = createUser("pixelpunk", "correct-horse-battery");
    const buffer = Buffer.from("fake-png-bytes");
    const asset = storeUserAsset(user.id, buffer, "image/png", "photo.png");

    expect(asset.kind).toBe("image");
    expect(asset.mimeType).toBe("image/png");
    expect(getUserAsset(asset.id)?.userId).toBe(user.id);
    expect(readAssetFile(asset.id)?.buffer.equals(buffer)).toBe(true);
    expect(userOwnsAsset(user.id, asset.id)).toBe(true);
    expect(userOwnsAsset("other", asset.id)).toBe(false);
  });

  it("rejects disallowed MIME types", () => {
    const user = createUser("pixelpunk2", "correct-horse-battery");
    expect(() => storeUserAsset(user.id, Buffer.from("x"), "application/pdf", "doc.pdf")).toThrow(
      AssetError,
    );
  });

  it("rejects oversize uploads", () => {
    const user = createUser("pixelpunk3", "correct-horse-battery");
    const big = Buffer.alloc(maxUploadBytes("image") + 1);
    expect(() => storeUserAsset(user.id, big, "image/png", "big.png")).toThrow(AssetError);
  });
});

describe("readBoundedBody", () => {
  it("rejects bodies larger than the configured limit", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: Buffer.alloc(2000),
    });
    await expect(readBoundedBody(request, 1500)).rejects.toThrow(AssetError);
  });

  it("accepts bodies within the configured limit", async () => {
    const payload = new Uint8Array(512);
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: payload,
      headers: { "content-length": String(payload.length) },
    });
    const result = await readBoundedBody(request, maxUploadRequestBytes());
    expect(result.length).toBe(512);
  });
});

describe("parseBoundedFormData", () => {
  it("throws InvalidUploadRequestError for non-multipart bodies", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: "not multipart",
      headers: { "content-type": "text/plain" },
    });
    await expect(parseBoundedFormData(request, maxUploadRequestBytes())).rejects.toThrow(
      InvalidUploadRequestError,
    );
  });
});

afterEach(() => {
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
});
