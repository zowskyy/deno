import type { DiscoverablePage } from "@/lib/discovery";
import { ExplorePageCard } from "./ExplorePageCard";

export function ExplorePageList({
  pages,
  emptyMessage = "Nothing here yet.",
}: {
  pages: DiscoverablePage[];
  emptyMessage?: string;
}) {
  if (pages.length === 0) {
    return <p className="explore-empty">{emptyMessage}</p>;
  }

  return (
    <ul className="explore-grid">
      {pages.map((p) => (
        <ExplorePageCard key={p.handle} page={p} />
      ))}
    </ul>
  );
}
