"use client";

import { useActionState } from "react";
import { signGuestbookAction, type GuestbookActionState } from "./actions";

const initialState: GuestbookActionState = {};

export function GuestbookSignForm({ handle }: { handle: string }) {
  const boundAction = signGuestbookAction.bind(null, handle);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <section className="guestbook-sign container-narrow" aria-label="Sign guestbook">
      <h2 className="part-label">Sign the guestbook</h2>
      {state.error && (
        <div className="error-banner" role="alert">{state.error}</div>
      )}
      {state.success && (
        <div className="success-banner" role="status">{state.success}</div>
      )}
      <form action={formAction}>
        <div className="field">
          <label htmlFor="guestbook-message">Your message</label>
          <textarea
            id="guestbook-message"
            name="message"
            rows={3}
            maxLength={500}
            required
            placeholder="Say something nice…"
          />
          <span className="hint">Up to 500 characters.</span>
        </div>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Signing…" : "Sign guestbook"}
        </button>
      </form>
    </section>
  );
}
