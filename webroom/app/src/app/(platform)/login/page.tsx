"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Webroom
      </p>
      <h1>Welcome back</h1>

      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction}>
        <div className="field">
          <label htmlFor="handle">Handle</label>
          <input id="handle" name="handle" type="text" required autoComplete="username" placeholder="voidarcade" />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
        New here? <Link href="/signup">Make your page</Link>
      </p>
    </main>
  );
}
