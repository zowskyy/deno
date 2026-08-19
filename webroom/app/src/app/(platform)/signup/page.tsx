"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type SignupState } from "./actions";

const initialState: SignupState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Webroom
      </p>
      <h1>Make your corner of the internet</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Pick a handle and a password. That&apos;s the whole account — no email required.
      </p>

      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction}>
        <div className="field">
          <label htmlFor="handle">Handle</label>
          <input
            id="handle"
            name="handle"
            type="text"
            required
            minLength={2}
            maxLength={30}
            pattern="[a-zA-Z0-9_\-]+"
            autoComplete="username"
            placeholder="voidarcade"
            aria-describedby="handle-hint"
          />
          <span id="handle-hint" className="hint">
            This becomes your page: webroom.example/@yourhandle
          </span>
        </div>

        <div className="field">
          <label htmlFor="displayName">Display name</label>
          <input id="displayName" name="displayName" type="text" maxLength={60} placeholder="Void Arcade" />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-describedby="password-hint"
          />
          <span id="password-hint" className="hint">
            At least 8 characters.
          </span>
        </div>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Making your account…" : "Make your page"}
        </button>
      </form>

      <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
        Already have a page? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
