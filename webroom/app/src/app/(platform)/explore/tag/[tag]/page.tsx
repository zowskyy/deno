import Link from "next/link";
import { notFound } from "next/navigation";
import { ExplorePageList } from "@/components/explore/ExplorePageList";
import { listByTag } from "@/lib/discovery";

interface Props {
  params: Promise<{ tag: string }>;
}

export default async function ExploreTagPage({ params }: Props) {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).trim().toLowerCase();
  if (!tag) notFound();

  const pages = listByTag(tag);

  return (
    <main className="container explore-container">
      <p className="mono explore-kicker">
        <Link href="/explore">Explore</Link> / tag
      </p>
      <h1>#{tag}</h1>
      <p className="explore-lead">Public pages tagged &ldquo;{tag}&rdquo;.</p>

      <ExplorePageList pages={pages} emptyMessage={`No public pages tagged “${tag}” yet.`} />

      <p className="explore-back">
        <Link href="/explore">Back to Explore</Link>
      </p>
    </main>
  );
}
