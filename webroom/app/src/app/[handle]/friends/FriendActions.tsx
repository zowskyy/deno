"use client";

import { useState } from "react";
import type { FriendRelationship } from "@/lib/friends";
import {
  acceptFriendRequestAction,
  declineFriendRequestAction,
  sendFriendRequestAction,
  unfriendAction,
  type FriendActionState,
} from "./actions";

interface Props {
  handle: string;
  relationship: FriendRelationship;
}

export function FriendActions({ handle, relationship }: Props) {
  const [state, setState] = useState<FriendActionState>({});
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<FriendActionState>) {
    setPending(true);
    setState({});
    const result = await action();
    setState(result);
    setPending(false);
  }

  if (relationship.status === "none") {
    return (
      <div className="friend-actions">
        {state.error && (
          <p className="friend-actions-error" role="alert">{state.error}</p>
        )}
        <button
          type="button"
          className="btn secondary friend-action-btn"
          disabled={pending}
          onClick={() => run(() => sendFriendRequestAction(handle))}
        >
          {pending ? "Sending…" : "Add friend"}
        </button>
      </div>
    );
  }

  if (relationship.status === "pending_sent") {
    return (
      <div className="friend-actions">
        {state.error && (
          <p className="friend-actions-error" role="alert">{state.error}</p>
        )}
        <p className="friend-actions-status mono">Friend request sent — waiting for them to respond.</p>
        <button
          type="button"
          className="btn secondary friend-action-btn"
          disabled={pending}
          onClick={() => run(() => declineFriendRequestAction(handle, relationship.requestId))}
        >
          {pending ? "Canceling…" : "Cancel request"}
        </button>
      </div>
    );
  }

  if (relationship.status === "pending_received") {
    return (
      <div className="friend-actions">
        {state.error && (
          <p className="friend-actions-error" role="alert">{state.error}</p>
        )}
        <p className="friend-actions-status mono">They sent you a friend request.</p>
        <div className="friend-actions-row">
          <button
            type="button"
            className="btn friend-action-btn"
            disabled={pending}
            onClick={() => run(() => acceptFriendRequestAction(handle, relationship.requestId))}
          >
            {pending ? "Accepting…" : "Accept"}
          </button>
          <button
            type="button"
            className="btn secondary friend-action-btn"
            disabled={pending}
            onClick={() => run(() => declineFriendRequestAction(handle, relationship.requestId))}
          >
            {pending ? "Declining…" : "Decline"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="friend-actions">
      {state.error && (
        <p className="friend-actions-error" role="alert">{state.error}</p>
      )}
      <p className="friend-actions-status mono">You&apos;re friends.</p>
      <button
        type="button"
        className="btn secondary friend-action-btn"
        disabled={pending}
        onClick={() => run(() => unfriendAction(handle, relationship.requestId))}
      >
        {pending ? "Removing…" : "Unfriend"}
      </button>
    </div>
  );
}
