"use client";

import Link from "next/link";

/** Load more feed items via cursor pagination. */
export function FeedLoadMore({ cursor }: { cursor: string }) {
  return (
    <p className="feed-load-more">
      <Link href={`/feed?cursor=${encodeURIComponent(cursor)}`}>Load more</Link>
    </p>
  );
}
