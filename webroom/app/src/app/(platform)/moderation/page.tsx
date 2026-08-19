import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ensureModeratorSeed,
  findUserForModeration,
  isModerator,
  listModeratorLogs,
  listOpenReports,
} from "@/lib/moderation";
import { getCurrentUser } from "@/lib/session";
import {
  dismissReportAction,
  dismissThemeReportAction,
  dismissAppealAction,
  grantAppealAction,
  platformBlockAction,
  platformUnblockAction,
  reviewReportAction,
  reviewThemeReportAction,
} from "./actions";
import { listOpenAppeals } from "@/lib/appeals";
import { listOpenThemeReports } from "@/lib/sharedThemes";

export default async function ModerationPage() {
  ensureModeratorSeed();

  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/moderation");
  if (!isModerator(viewer.id)) redirect("/");

  const reports = listOpenReports();
  const themeReports = listOpenThemeReports();
  const appeals = listOpenAppeals();
  const logs = listModeratorLogs(30);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Moderation
      </p>
      <h1>Report queue</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Open reports from visitors and signed-in users. Review or dismiss each one, and platform-block handles when needed.
      </p>

      {reports.length === 0 ? (
        <p className="empty-note" style={{ marginTop: "1.5rem" }}>
          No open reports — the queue is clear.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "1.5rem 0 0", display: "grid", gap: "1rem" }}>
          {reports.map((report) => {
            const target = findUserForModeration(report.reportedHandle);
            const reviewAction = reviewReportAction.bind(null, report.id);
            const dismissAction = dismissReportAction.bind(null, report.id);
            const blockAction = platformBlockAction.bind(null, report.reportedHandle);
            const unblockAction = platformUnblockAction.bind(null, report.reportedHandle);

            return (
              <li
                key={report.id}
                style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "1rem" }}
              >
                <p style={{ margin: 0, fontWeight: 600 }}>
                  @{report.reportedHandle}
                  <span className="mono" style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                    {report.reason}
                  </span>
                </p>
                <p className="mono" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                  {new Date(report.createdAt).toLocaleString()}
                  {report.reporterHandle ? ` · reported by @${report.reporterHandle}` : " · anonymous report"}
                </p>

                <form action={reviewAction} style={{ marginTop: "0.75rem" }}>
                  <label htmlFor={`note-${report.id}`} style={{ display: "block", fontSize: "0.9rem", marginBottom: "0.35rem" }}>
                    Moderator note (optional)
                  </label>
                  <textarea id={`note-${report.id}`} name="note" rows={2} style={{ width: "100%", marginBottom: "0.5rem" }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <button type="submit" className="btn">
                      Mark reviewed
                    </button>
                    <button type="submit" className="btn secondary" formAction={dismissAction}>
                      Dismiss
                    </button>
                  </div>
                </form>

                {target && (
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--line)" }}>
                    {target.isBlockedPlatform ? (
                      <form action={unblockAction}>
                        <button type="submit" className="btn secondary">
                          Platform-unblock @{target.handle}
                        </button>
                      </form>
                    ) : (
                      <form action={blockAction}>
                        <button type="submit" className="btn" style={{ background: "var(--danger)", borderColor: "var(--danger)" }}>
                          Platform-block @{target.handle}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section style={{ marginTop: "2.5rem" }}>
        <h2>Theme reports</h2>
        {themeReports.length === 0 ? (
          <p className="empty-note">No open theme reports.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", display: "grid", gap: "1rem" }}>
            {themeReports.map((report) => {
              const reviewAction = reviewThemeReportAction.bind(null, report.id);
              const dismissAction = dismissThemeReportAction.bind(null, report.id);
              return (
                <li
                  key={report.id}
                  style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "1rem" }}
                >
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    {report.themeName}
                    <span className="mono" style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                      {report.reason}
                    </span>
                  </p>
                  <p className="mono" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                    {new Date(report.createdAt).toLocaleString()}
                    {report.reporterHandle ? ` · reported by @${report.reporterHandle}` : " · anonymous"}
                    {" · "}
                    <Link href={`/explore/themes/${report.themeId}`}>View theme</Link>
                  </p>
                  <form action={reviewAction} style={{ marginTop: "0.75rem" }}>
                    <textarea name="note" rows={2} placeholder="Moderator note (optional)" style={{ width: "100%", marginBottom: "0.5rem" }} />
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button type="submit" className="btn">Mark reviewed</button>
                      <button type="submit" className="btn secondary" formAction={dismissAction}>Dismiss</button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2>Appeals</h2>
        {appeals.length === 0 ? (
          <p className="empty-note">No open appeals.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", display: "grid", gap: "1rem" }}>
            {appeals.map((appeal) => {
              const grantAction = grantAppealAction.bind(null, appeal.id);
              const dismissAction = dismissAppealAction.bind(null, appeal.id);
              return (
                <li
                  key={appeal.id}
                  style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "1rem" }}
                >
                  <p style={{ margin: 0, fontWeight: 600 }}>@{appeal.userHandle}</p>
                  <p style={{ margin: "0.5rem 0 0" }}>{appeal.reason}</p>
                  <p className="mono" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                    {new Date(appeal.createdAt).toLocaleString()} · {appeal.appealType.replace("_", " ")}
                  </p>
                  <form action={grantAction} style={{ marginTop: "0.75rem" }}>
                    <textarea name="note" rows={2} placeholder="Moderator note (optional)" style={{ width: "100%", marginBottom: "0.5rem" }} />
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button type="submit" className="btn">Grant appeal</button>
                      <button type="submit" className="btn secondary" formAction={dismissAction}>Dismiss</button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2>Recent moderator actions</h2>
        {logs.length === 0 ? (
          <p className="empty-note">No actions logged yet.</p>
        ) : (
          <ul className="mono" style={{ fontSize: "0.85rem", paddingLeft: "1.25rem" }}>
            {logs.map((log, i) => (
              <li key={`${log.createdAt}-${i}`} style={{ marginBottom: "0.35rem" }}>
                {new Date(log.createdAt).toLocaleString()} · @{log.moderatorHandle} · {log.action}
                {log.targetHandle ? ` · @${log.targetHandle}` : ""}
                {log.detail ? ` — ${log.detail}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: "2rem" }}>
        <Link href="/explore">Back to Explore</Link>
      </p>
    </main>
  );
}
