import { redirect } from "next/navigation";
import { listFriends } from "@/lib/friends";
import { listApprovedGuestbookEntries } from "@/lib/guestbook";
import { getPageDocument, listVersions } from "@/lib/pageDocument";
import { getCurrentUser } from "@/lib/session";
import { StudioClient } from "./StudioClient";

export default async function StudioPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/studio");

  const stored = getPageDocument(viewer.id);
  if (!stored) redirect("/make");

  const friends = listFriends(viewer.id);
  const versions = listVersions(viewer.id);
  const guestbookEntries = listApprovedGuestbookEntries(viewer.id);
  const workingDocument = stored.draftDocument ?? stored.document;

  return (
    <StudioClient
      initialDocument={workingDocument}
      publishedDocument={stored.document}
      hasDraft={!!stored.draftDocument}
      isPublished={stored.isPublished}
      visibility={stored.visibility}
      hiddenFromDiscovery={stored.hiddenFromDiscovery}
      guestbookDisabled={stored.guestbookDisabled}
      versions={versions}
      handle={viewer.handle}
      friends={friends}
      guestbookEntries={guestbookEntries}
    />
  );
}
