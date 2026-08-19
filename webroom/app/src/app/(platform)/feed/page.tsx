import Link from "next/link";
import { listFeedItems } from "@/lib/feed";
import { listRecommendedPages } from "@/lib/recommendations";
import { getCurrentUser } from "@/lib/session";
import { FeedLoadMore } from "./FeedLoadMore";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const user = await getCurrentUser();
  const { cursor } = await searchParams;
  const items = listFeedItems(user?.id ?? null, { cursor, limit: 20 });
  const recommendations = listRecommendedPages(user?.id ?? null, 8);
  const nextCursor = items.length > 0 ? items[items.length - 1]!.createdAt : undefined;

  return (
    <main className="container feed-container">
      <header className="explore-header">
        <p className="mono explore-kicker">Feed</p>
        <h1>Activity from your corner of the web</h1>
        <p className="explore-lead">
          Pages your friends redecorated and public updates — ranked by connection, not engagement scores.
        </p>
      </header>

      {recommendations.length > 0 && (
        <section className="feed-recommendations profile-panel">
          <h2 className="part-label">Recommended for you</h2>
          <ul className="feed-rec-list">
            {recommendations.map((r) => (
              <li key={r.handle}>
                <Link href={`/@${r.handle}`}>@{r.handle}</Link>
                <span className="feed-rec-reason">{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="feed-list profile-panel" aria-label="Activity feed">
        <h2 className="part-label">Recent activity</h2>
        {items.length === 0 ? (
          <p className="empty-note">Nothing in the feed yet — publish a page or add friends.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="feed-item">
                <Link href={`/@${item.handle}`}>
                  <strong>{item.displayName}</strong>
                </Link>
                <span> — {item.summary}</span>
                <time className="mono feed-time" dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
        {nextCursor && items.length >= 20 && <FeedLoadMore cursor={nextCursor} />}
      </section>
    </main>
  );
}
