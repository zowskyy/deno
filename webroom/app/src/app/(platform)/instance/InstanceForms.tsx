"use client";

import { useActionState } from "react";
import { followRemoteAction, saveInstanceUrlAction, type InstanceActionState } from "./actions";

const initialState: InstanceActionState = {};

/** Moderator form for saving the public instance URL. */
export function InstanceUrlForm({ defaultUrl }: { defaultUrl: string }) {
  const [state, formAction, pending] = useActionState(saveInstanceUrlAction, initialState);

  return (
    <form action={formAction} className="instance-form">
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      <label htmlFor="instance-url">Public instance URL</label>
      <input id="instance-url" name="instanceUrl" type="url" defaultValue={defaultUrl} required />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

/** Form for following a remote federated profile. */
export function FollowRemoteForm() {
  const [state, formAction, pending] = useActionState(followRemoteAction, initialState);

  return (
    <form action={formAction} className="instance-form">
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      <label htmlFor="profile-url">Profile URL on another instance</label>
      <input
        id="profile-url"
        name="profileUrl"
        type="url"
        placeholder="https://other.example/api/federation/profile/handle"
        required
      />
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Following…" : "Follow"}
      </button>
    </form>
  );
}
