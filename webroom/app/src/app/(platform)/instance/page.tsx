import Link from "next/link";
import { redirect } from "next/navigation";
import { getInstanceUrl } from "@/lib/instance";
import { listFederationFollows } from "@/lib/federation";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";
import { FollowRemoteForm, InstanceUrlForm } from "./InstanceForms";

export default async function InstancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const moderator = isModerator(user.id);
  const instanceUrl = getInstanceUrl();
  const follows = listFederationFollows(user.id);

  return (
    <main className="container instance-container">
      <header className="explore-header">
        <p className="mono explore-kicker">Instance</p>
        <h1>Self-hosting &amp; federation</h1>
        <p className="explore-lead">
          Run your own Webroom instance and follow profiles on other instances.
        </p>
      </header>

      <section className="profile-panel">
        <h2 className="part-label">This instance</h2>
        <p className="mono">{instanceUrl}</p>
        <p>
          Your public profile exports at{" "}
          <code>{instanceUrl}/api/federation/profile/{user.handle}</code>
        </p>
        {moderator && <InstanceUrlForm defaultUrl={instanceUrl} />}
      </section>

      <section className="profile-panel">
        <h2 className="part-label">Follow a remote profile</h2>
        <FollowRemoteForm />
        {follows.length > 0 && (
          <ul className="federation-follows">
            {follows.map((f) => (
              <li key={f.id}>
                @{f.remoteHandle} on {f.instanceDomain}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <Link href="/policy">Community policy</Link>
      </p>
    </main>
  );
}
