import Link from "next/link";
import { redirect } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { listConversations, listDirectMessagesForUser, markReadAction, sendMessageAction } from "./actions";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { with: withHandle } = await searchParams;
  const conversations = listConversations(user.id);
  const otherUser = withHandle ? findUserByHandle(withHandle) : null;
  const thread =
    otherUser && otherUser.id !== user.id
      ? listDirectMessagesForUser(user.id, { withUserId: otherUser.id, limit: 50 })
      : [];

  if (otherUser && otherUser.id !== user.id) {
    await markReadAction(otherUser.id);
  }

  return (
    <main className="container messages-container">
      <header className="explore-header">
        <p className="mono explore-kicker">Messages</p>
        <h1>Direct messages</h1>
        <p className="explore-lead">Private conversations — no feed, no public thread.</p>
      </header>

      <div className="messages-layout">
        <aside className="messages-sidebar profile-panel">
          <h2 className="part-label">Conversations</h2>
          {conversations.length === 0 ? (
            <p className="empty-note">No messages yet.</p>
          ) : (
            <ul className="messages-conv-list">
              {conversations.map((c) => (
                <li key={c.otherUserId}>
                  <Link
                    href={`/messages?with=${encodeURIComponent(c.otherHandle)}`}
                    className={withHandle === c.otherHandle ? "messages-conv-active" : undefined}
                  >
                    @{c.otherHandle}
                    {c.unread ? " · new" : ""}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="messages-main">
          {otherUser && otherUser.id !== user.id && (
            <div className="messages-thread profile-panel" aria-label={`Conversation with @${otherUser.handle}`}>
              <h2 className="part-label">@{otherUser.handle}</h2>
              {thread.length === 0 ? (
                <p className="empty-note">No messages yet — say hello.</p>
              ) : (
                <ul className="messages-thread-list">
                  {[...thread].reverse().map((msg) => (
                    <li
                      key={msg.id}
                      className={msg.senderId === user.id ? "messages-msg-out" : "messages-msg-in"}
                    >
                      <p className="messages-msg-body">{msg.body}</p>
                      <time className="mono messages-msg-time" dateTime={msg.createdAt}>
                        {new Date(msg.createdAt).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="messages-compose profile-panel">
            <h2 className="part-label">New message</h2>
            <form action={sendMessageAction} className="messages-form">
              <label htmlFor="dm-handle">To</label>
              <input
                id="dm-handle"
                name="handle"
                type="text"
                required
                placeholder="handle"
                defaultValue={withHandle ?? ""}
              />
              <label htmlFor="dm-body">Message</label>
              <textarea
                id="dm-body"
                name="body"
                required
                rows={4}
                maxLength={2000}
                placeholder="Say something…"
              />
              <button type="submit" className="btn-primary">
                Send
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
