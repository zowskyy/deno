"use client";

import { useActionState } from "react";
import { reportThemeAction, type ThemeReportState } from "./actions";

const initialState: ThemeReportState = {};

export function ThemeReportForm({ themeId, compact = false }: { themeId: string; compact?: boolean }) {
  const boundAction = reportThemeAction.bind(null, themeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className={compact ? "theme-report-form theme-report-form--compact" : "theme-report-form"}>
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="success-banner" role="status">
          {state.success}
        </div>
      )}
      <label htmlFor={`theme-report-${themeId}`} className="theme-report-label">
        {compact ? "Report" : "Report this theme"}
      </label>
      <textarea
        id={`theme-report-${themeId}`}
        name="reason"
        rows={compact ? 2 : 3}
        required
        maxLength={500}
        placeholder="What's wrong with this theme?"
        className="theme-report-input"
      />
      <button type="submit" className="btn secondary" disabled={pending}>
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
