"use client";

import { useState } from "react";
import type { PageDocument } from "@/lib/pageDocumentTypes";

interface AiPageAssistProps {
  displayName: string;
  onGenerated: (document: PageDocument) => void;
}

/** Generate a page draft from a natural-language prompt (template or optional LLM). */
export function AiPageAssist({ displayName, onGenerated }: AiPageAssistProps) {
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, displayName }),
      });
      const data = (await res.json()) as { error?: string; document?: PageDocument };
      if (!res.ok || !data.document) {
        setError(data.error ?? "Generation failed.");
        return;
      }
      onGenerated(data.document);
      setPrompt("");
    } catch {
      setError("Generation failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <fieldset className="studio-fieldset ai-assist">
      <legend>AI assist</legend>
      <p className="studio-hint">
        Describe the vibe — uses built-in templates offline, or your API key when configured.
      </p>
      <label className="field">
        <span>Prompt</span>
        <textarea
          rows={3}
          maxLength={500}
          value={prompt}
          placeholder="Cozy pixel-art shrine to my favorite band…"
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn secondary"
        disabled={pending || !prompt.trim()}
        onClick={() => void generate()}
      >
        {pending ? "Generating…" : "Generate page draft"}
      </button>
      {error && <p className="studio-warning">{error}</p>}
    </fieldset>
  );
}
