"use client";

import { useRef, useState } from "react";

interface AssetUploadButtonProps {
  accept: string;
  label: string;
  onUploaded: (assetId: string, kind: string) => void;
}

/** Upload a hosted image or audio file via the assets API. */
export function AssetUploadButton({ accept, label, onUploaded }: AssetUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/assets/upload", { method: "POST", body: form });
      const data = (await res.json()) as { error?: string; assetId?: string; kind?: string };
      if (!res.ok || !data.assetId) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      onUploaded(data.assetId, data.kind ?? "image");
    } catch {
      setError("Upload failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="asset-upload">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="btn secondary"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Uploading…" : label}
      </button>
      {error && <p className="studio-warning">{error}</p>}
    </div>
  );
}
