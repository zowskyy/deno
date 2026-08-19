"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendMessageAction, type MessageActionState } from "./actions";

const initialState: MessageActionState = {};

/** Compose form for sending a direct message with visible errors. */
export function MessagesComposeForm({ defaultHandle }: { defaultHandle?: string }) {
  const [state, formAction, pending] = useActionState(sendMessageAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.sent) formRef.current?.reset();
  }, [state.sent]);

  return (
    <form ref={formRef} action={formAction} className="messages-form">
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      {state.sent && !state.error && (
        <div className="success-banner" role="status">
          Message sent.
        </div>
      )}
      <label htmlFor="dm-handle">To</label>
      <input
        id="dm-handle"
        name="handle"
        type="text"
        required
        placeholder="handle"
        defaultValue={defaultHandle ?? ""}
      />
      <label htmlFor="dm-body">Message</label>
      <textarea id="dm-body" name="body" required rows={4} maxLength={2000} placeholder="Say something…" />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
