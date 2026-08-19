import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureSeedCollections, getCollectionBySlug, listCollectionPages } from "@/lib/collections";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ExploreCollectionPage({ params }: Props) {
  ensureSeedCollections();

  const { slug } = await params;
  const collection = getCollectionBySlug(slug);
  if (!collection) notFound();

  const pages = listCollectionPages(collection.id);

  return (
    <main className="container explore-container">
      <p className="mono explore-kicker">
        <Link href="/explore">Explore</Link> / collection
      </p>
      <h1>{collection.title}</h1>
      <p className="explore-lead">{collection.description}</p>

      {pages.length === 0 ? (
        <p className="explore-empty">This collection is empty for now.</p>
      ) : (
        <ol className="explore-collection-list">
          {pages.map((p, i) => (
            <li key={p.handle} className="explore-collection-item">
              <span className="mono explore-collection-position">{i + 1}</span>
              <div>
                <Link href={`/@${p.handle}`} className="explore-collection-name">{p.displayName}</Link>
                <span className="mono explore-template-handle"> @{p.handle}</span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="explore-back">
        <Link href="/explore">Back to Explore</Link>
      </p>
    </main>
  );
}
