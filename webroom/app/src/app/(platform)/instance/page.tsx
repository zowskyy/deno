import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";
import { followRemoteAction, getInstanceUrl, listFederationFollows, saveInstanceUrlAction } from "./actions";

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
        {moderator && (
          <form action={saveInstanceUrlAction} className="instance-form">
            <label htmlFor="instance-url">Public instance URL</label>
            <input id="instance-url" name="instanceUrl" type="url" defaultValue={instanceUrl} />
            <button type="submit" className="btn-primary">
              Save
            </button>
          </form>
        )}
      </section>

      <section className="profile-panel">
        <h2 className="part-label">Follow a remote profile</h2>
        <form action={followRemoteAction} className="instance-form">
          <label htmlFor="profile-url">Profile URL on another instance</label>
          <input
            id="profile-url"
            name="profileUrl"
            type="url"
            placeholder="https://other.example/api/federation/profile/handle"
            required
          />
          <button type="submit" className="btn-secondary">
            Follow
          </button>
        </form>
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
