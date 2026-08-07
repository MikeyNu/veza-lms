import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

const allowedRoles = new Set(["tenant-owner", "institution-admin", "support-agent"]);

export default async function SupportPage() {
  const resolution = await requireWorkspaceSession();
  if (!resolution.session.membership.roles.some((role) => allowedRoles.has(role))) notFound();

  return (
    <AppShell session={resolution.session} active="support">
      <section className="workspace support-workspace" aria-labelledby="support-title">
        <header className="support-heading">
          <div>
            <h1 id="support-title">Support cases</h1>
            <p>Review verified service incidents and the diagnostic access approved for each case.</p>
          </div>
        </header>

        <div className="support-layout">
          <section className="support-case-list" aria-labelledby="support-cases-title">
            <header>
              <div>
                <h2 id="support-cases-title">Institution cases</h2>
                <p>Only approved, purpose-bound cases belong in this workspace.</p>
              </div>
              <span>0 open</span>
            </header>
            <div className="support-table-wrap">
              <table>
                <thead><tr><th>Case</th><th>Service</th><th>Status</th><th>Diagnostic access</th><th>Updated</th></tr></thead>
                <tbody>
                  <tr className="support-empty-row"><td colSpan={5}><strong>No approved support case is open</strong><span>When a verified institutional service incident is created, its status and approved diagnostic scope will appear here.</span></td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <aside className="support-policy" aria-labelledby="support-policy-title">
            <h2 id="support-policy-title">Support access boundary</h2>
            <dl>
              <div><dt>Approval</dt><dd>Institution approval is required before privileged diagnostic access.</dd></div>
              <div><dt>Purpose</dt><dd>Every assisted session is bound to a documented case and purpose.</dd></div>
              <div><dt>Expiry</dt><dd>Access expires automatically and is never granted indefinitely.</dd></div>
              <div><dt>Evidence</dt><dd>Elevation and support actions create immutable audit evidence.</dd></div>
            </dl>
            <div className="support-security-note"><strong>Do not include credentials</strong><p>Passwords, invitation tokens and unrestricted learner exports do not belong in support case descriptions.</p></div>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
