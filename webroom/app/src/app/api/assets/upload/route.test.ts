import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assets/upload/route";
import { createUser } from "@/lib/auth";
import { resetDbForTests } from "@/lib/db";
import { maxUploadRequestBytes } from "@/lib/assets";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "@/lib/session";

process.env.WEBROOM_DB_PATH = ":memory:";

let uploadDir = "";

beforeEach(() => {
  resetDbForTests();
  uploadDir = mkdtempSync(join(tmpdir(), "webroom-upload-route-"));
  process.env.WEBROOM_UPLOAD_DIR = uploadDir;
});

afterEach(() => {
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  vi.mocked(getCurrentUser).mockReset();
});

describe("POST /api/assets/upload", () => {
  it("returns 401 when not logged in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/assets/upload", { method: "POST", body: "x" }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 413 for oversized bodies before multipart parsing", async () => {
    const user = createUser("uploader", "correct-horse-battery");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const response = await POST(
      new Request("http://localhost/api/assets/upload", {
        method: "POST",
        body: Buffer.alloc(maxUploadRequestBytes() + 1),
        headers: { "content-type": "multipart/form-data; boundary=x" },
      }),
    );
    expect(response.status).toBe(413);
  });

  it("returns 400 for malformed multipart input", async () => {
    const user = createUser("uploader2", "correct-horse-battery");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const response = await POST(
      new Request("http://localhost/api/assets/upload", {
        method: "POST",
        body: "not-multipart",
        headers: { "content-type": "text/plain" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("accepts a valid image upload", async () => {
    const user = createUser("uploader3", "correct-horse-battery");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/assets/upload", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean; assetId: string };
    expect(json.ok).toBe(true);
    expect(json.assetId).toBeTruthy();
  });
});
