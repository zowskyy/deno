"use client";

import { useActionState } from "react";
import { TemplateMoodPicker } from "@/components/studio/TemplateMoodPicker";
import { makeFlowAction, type MakeState } from "./actions";

const initialState: MakeState = {};

const PARTS: { id: string; label: string; hint: string; defaultOn: boolean }[] = [
  { id: "links", label: "Links", hint: "Your corner of the web", defaultOn: true },
  { id: "now", label: "Now", hint: "What you're up to", defaultOn: true },
  { id: "friends", label: "Friends", hint: "The real graph", defaultOn: true },
  { id: "gallery", label: "Gallery", hint: "Images with stories", defaultOn: false },
  { id: "guestbook", label: "Guestbook", hint: "Leave a note", defaultOn: false },
  { id: "topEight", label: "Top 8", hint: "Your favorites", defaultOn: false },
  { id: "badges", label: "Badges", hint: "Stickers & stamps", defaultOn: false },
  { id: "shrine", label: "Shrines", hint: "Something you love", defaultOn: false },
  { id: "playlist", label: "Playlist", hint: "Songs you adore", defaultOn: false },
  { id: "pixelArt", label: "Pixel art", hint: "Tiny handmade grids", defaultOn: false },
  { id: "miniPages", label: "Mini-pages", hint: "Extra rooms", defaultOn: false },
];

export function MakeForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [state, formAction, pending] = useActionState(makeFlowAction, initialState);

  return (
    <form action={formAction} className="make-form">
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}

      <fieldset className="make-fieldset">
        <legend>Pick a feeling</legend>
        <p className="make-hint">Start with a mood — you can go wilder in Studio later.</p>
        <TemplateMoodPicker />
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

      <fieldset className="make-fieldset">
        <legend>One link</legend>
        <div className="field">
          <label htmlFor="linkLabel">Link label</label>
          <input id="linkLabel" name="linkLabel" type="text" maxLength={80} placeholder="My portfolio" />
        </div>
        <div className="field">
          <label htmlFor="linkUrl">Link URL</label>
          <input id="linkUrl" name="linkUrl" type="url" placeholder="https://example.com" />
        </div>
      </fieldset>

      <fieldset className="make-fieldset">
        <legend>What belongs on your page?</legend>
        <p className="make-hint">Turn on anything that sounds fun — add more anytime in Studio.</p>
        <div className="make-parts-grid">
          {PARTS.map((p) => (
            <label key={p.id} className="make-part-card">
              <input type="checkbox" name="pageParts" value={p.id} defaultChecked={p.defaultOn} />
              <span className="make-part-name">{p.label}</span>
              <span className="make-part-hint">{p.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Publishing…" : "Publish your corner"}
      </button>
    </form>
  );
}
