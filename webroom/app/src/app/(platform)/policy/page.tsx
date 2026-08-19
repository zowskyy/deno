import Link from "next/link";

export default function PolicyPage() {
  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Community
      </p>
      <h1>Community policy</h1>
      <p style={{ color: "var(--ink-soft)", maxWidth: "42rem" }}>
        Webroom is a place to make your corner of the internet — expressive, personal, and safe enough for
        strangers to wander. These rules keep that balance.
      </p>

      <section className="settings-section">
        <h2>Be a good neighbor</h2>
        <ul style={{ lineHeight: 1.7 }}>
          <li>No harassment, threats, or targeted abuse — in guestbooks, friend requests, or page content.</li>
          <li>No impersonation of real people, brands, or other Webroom users.</li>
          <li>No spam, scams, or deceptive links.</li>
          <li>No content that sexualizes minors or promotes violence.</li>
        </ul>
      </section>

      <section className="settings-section">
        <h2>Customization boundaries</h2>
        <ul style={{ lineHeight: 1.7 }}>
          <li>Custom CSS is scoped to your page — no scripts, no breaking out of your profile container.</li>
          <li>Images and links must use ordinary web addresses (http/https). No autoplay audio or hidden trackers.</li>
          <li>Shared themes in the gallery follow the same safety rules.</li>
        </ul>
      </section>

      <section className="settings-section">
        <h2>Privacy and control</h2>
        <ul style={{ lineHeight: 1.7 }}>
          <li>You choose private, unlisted, or public visibility. Private means only you can view your page.</li>
          <li>Block anyone. Report pages or themes that break these rules.</li>
          <li>Guestbook messages can require your approval before they appear.</li>
          <li>Panic mode instantly hides your page from discovery.</li>
        </ul>
      </section>

      <section className="settings-section">
        <h2>Moderation and appeals</h2>
        <p style={{ lineHeight: 1.7 }}>
          Reports are reviewed by human moderators. Platform blocks remove access to posting and signing in.
          If your account is platform-blocked, you can file an appeal from Settings explaining why the block
          should be lifted. Appeals are reviewed in order; granting an appeal restores your account.
        </p>
      </section>

      <section className="settings-section">
        <h2>What we don&apos;t do</h2>
        <ul style={{ lineHeight: 1.7 }}>
          <li>No algorithmic feed ranking your worth.</li>
          <li>No visitor analytics or tracking pixels on your page.</li>
          <li>No selling your data.</li>
        </ul>
      </section>

      <p style={{ marginTop: "2rem" }}>
        <Link href="/explore">Back to Explore</Link>
      </p>
    </main>
  );
}
