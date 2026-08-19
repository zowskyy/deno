"use client";

import { useActionState } from "react";
import { publishThemeAction, type ThemeActionResult } from "./actions";

const initialState: ThemeActionResult = {};

export function PublishThemeForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(publishThemeAction, initialState);

  return (
    <form action={formAction} className="theme-publish-form">
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      <div className="theme-publish-fields">
        <label htmlFor="theme-publish-name">
          Name
          <input id="theme-publish-name" name="name" type="text" required maxLength={80} defaultValue={defaultName} />
        </label>
        <label htmlFor="theme-publish-description">
          Description
          <textarea id="theme-publish-description" name="description" rows={2} required maxLength={280} placeholder="What mood does this theme set?" />
        </label>
        <label htmlFor="theme-publish-tags">
          Tags
          <input id="theme-publish-tags" name="tags" type="text" required placeholder="y2k, neon, retro" />
        </label>
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Publishing…" : "Publish your theme"}
      </button>
    </form>
  );
}
