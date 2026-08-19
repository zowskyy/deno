"use client";

import { useActionState } from "react";
import { reportAction, type ReportState } from "./actions";

const initialState: ReportState = {};

const REASONS: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment or targeted abuse" },
  { value: "impersonation", label: "Impersonating someone else" },
  { value: "unsafe-content", label: "Unsafe or dangerous content" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
];

export function ReportForm({ handle }: { handle: string }) {
  const boundAction = reportAction.bind(null, handle);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction}>
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.25rem" }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Reason</legend>
        {REASONS.map((r) => (
          <label key={r.value} style={{ display: "flex", gap: "0.5rem", padding: "0.35rem 0", alignItems: "center" }}>
            <input type="radio" name="reason" value={r.value} required />
            {r.label}
          </label>
        ))}
      </fieldset>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
