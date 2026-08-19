"use client";

import { useActionState } from "react";
import { makeFlowAction, type MakeState } from "./actions";

const initialState: MakeState = {};

const TEMPLATES: { id: string; label: string }[] = [
  { id: "soft-web", label: "Soft Web" },
  { id: "pixel-tavern", label: "Pixel Tavern" },
  { id: "chrome-angel", label: "Chrome Angel" },
  { id: "dark-zine", label: "Dark Zine" },
  { id: "clean-portfolio", label: "Clean Portfolio" },
  { id: "start-simple", label: "Start Simple" },
];

const PARTS: { id: string; label: string; defaultOn: boolean }[] = [
  { id: "links", label: "Links", defaultOn: true },
  { id: "now", label: "Now", defaultOn: true },
  { id: "friends", label: "Friends", defaultOn: true },
  { id: "gallery", label: "Gallery", defaultOn: false },
  { id: "guestbook", label: "Guestbook", defaultOn: false },
  { id: "topEight", label: "Top 8", defaultOn: false },
  { id: "badges", label: "Badges", defaultOn: false },
];

export function MakeForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [state, formAction, pending] = useActionState(makeFlowAction, initialState);

  return (
    <form action={formAction}>
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.5rem" }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.6rem" }}>Pick a feeling</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.6rem" }}>
          {TEMPLATES.map((t, i) => (
            <label
              key={t.id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "var(--paper-raised)",
                cursor: "pointer",
              }}
            >
              <input type="radio" name="template" value={t.id} defaultChecked={i === TEMPLATES.length - 1} />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="displayName">Your name</label>
        <input id="displayName" name="displayName" type="text" required maxLength={60} defaultValue={initialDisplayName} />
      </div>

      <div className="field">
        <label htmlFor="bio">One sentence about you</label>
        <input id="bio" name="bio" type="text" maxLength={280} placeholder="Making small strange worlds." />
      </div>

      <div className="field">
        <label htmlFor="now">What&apos;s happening now?</label>
        <input id="now" name="now" type="text" maxLength={280} placeholder="Sketching a zine, learning linocut…" />
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.5rem" }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.6rem" }}>One link</legend>
        <div className="field">
          <label htmlFor="linkLabel">Link label</label>
          <input id="linkLabel" name="linkLabel" type="text" maxLength={80} placeholder="My portfolio" />
        </div>
        <div className="field">
          <label htmlFor="linkUrl">Link URL</label>
          <input id="linkUrl" name="linkUrl" type="url" placeholder="https://example.com" />
        </div>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.5rem" }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.6rem" }}>What belongs on your page?</legend>
        {PARTS.map((p) => (
          <label key={p.id} style={{ display: "flex", gap: "0.5rem", padding: "0.3rem 0", alignItems: "center" }}>
            <input type="checkbox" name="pageParts" value={p.id} defaultChecked={p.defaultOn} />
            {p.label}
          </label>
        ))}
      </fieldset>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Publishing…" : "Publish"}
      </button>
    </form>
  );
}
