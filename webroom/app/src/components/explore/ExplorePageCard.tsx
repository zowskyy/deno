import Link from "next/link";
import type { DiscoverablePage } from "@/lib/discovery";

export function ExplorePageCard({ page }: { page: DiscoverablePage }) {
  return (
    <li className="explore-card">
      <Link href={`/@${page.handle}`} className="explore-card-name">
        {page.displayName}
      </Link>
      <span className="explore-card-handle mono">@{page.handle}</span>
      {page.tags.length > 0 && (
        <div className="explore-card-tags">
          {page.tags.slice(0, 4).map((tag) => (
            <Link key={tag} href={`/explore/tag/${encodeURIComponent(tag)}`} className="explore-tag-pill">
              {tag}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}
