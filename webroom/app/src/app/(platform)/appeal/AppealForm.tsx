"use client";

import { useActionState } from "react";
import { appealAction, type AppealState } from "./actions";

const initialState: AppealState = {};

export function AppealForm() {
  const [state, formAction, pending] = useActionState(appealAction, initialState);

  return (
    <form action={formAction} style={{ marginTop: "1.5rem", display: "grid", gap: "1rem" }}>
      {state.error && (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" style={{ color: "var(--moss)", margin: 0 }}>
          {state.success}
        </p>
      )}
      <label>
        Handle
        <input name="handle" type="text" required autoComplete="username" placeholder="yourname" disabled={pending} />
      </label>
      <label>
        Password
        <input name="password" type="password" required autoComplete="current-password" disabled={pending} />
      </label>
      <label>
        Why should the block be lifted?
        <textarea
          name="reason"
          rows={5}
          required
          maxLength={1000}
          placeholder="Explain what happened and why you believe the block was a mistake."
          disabled={pending}
        />
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Submitting…" : "Submit appeal"}
      </button>
    </form>
  );
}
