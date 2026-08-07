import Link from "next/link";
import { AppShell } from "../../src/components/app-shell";
import { identityProviderRecoveryUrl, identityProviderSupportUrl } from "../../src/server/identity-provider-links";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

function label(value: string): string {
  return value.replaceAll("-", " ").replaceAll("_", " ");
}

function initials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || "Veza user";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "VZ";
}

export default async function ProfilePage() {
  const resolution = await requireWorkspaceSession();
  const { session } = resolution;
  const recoveryUrl = identityProviderRecoveryUrl();
  const providerSupportUrl = identityProviderSupportUrl();
  const displayName = session.principal.displayName ?? session.principal.email ?? "Veza user";
  const roles = session.membership.roles.map(label);

  return (
    <AppShell session={session}>
      <section className="workspace profile-workspace" aria-labelledby="profile-title">
        <header className="profile-heading">
          <div className="profile-heading-identity">
            <span className="profile-avatar" aria-hidden="true">
              {initials(session.principal.displayName, session.principal.email)}
            </span>
            <div>
              <p>YOUR ACCOUNT</p>
              <h1 id="profile-title">{displayName}</h1>
              <span>{session.principal.email ?? "No email claim is available in this session."}</span>
            </div>
          </div>
          <Link className="profile-switch" href="/select-workspace">Switch institution</Link>
        </header>

        <div className="profile-layout">
          <main className="profile-record">
            <section aria-labelledby="profile-identity-title">
              <header>
                <div>
                  <h2 id="profile-identity-title">Identity</h2>
                  <p>Your authenticated identity is supplied by your institution's identity provider.</p>
                </div>
              </header>
              <dl className="profile-detail-list">
                <div><dt>Display name</dt><dd>{displayName}</dd></div>
                <div><dt>Email</dt><dd>{session.principal.email ?? "Not supplied"}</dd></div>
                <div><dt>Identity authority</dt><dd>Institution identity provider</dd></div>
              </dl>
            </section>

            <section aria-labelledby="profile-workspace-title">
              <header>
                <div>
                  <h2 id="profile-workspace-title">Current workspace</h2>
                  <p>Workspace access is determined by your active membership and institution-assigned roles.</p>
                </div>
              </header>
              <dl className="profile-detail-list">
                <div><dt>Institution</dt><dd>{session.tenant.displayName}</dd></div>
                <div><dt>Membership</dt><dd>{label(session.membership.status)}</dd></div>
                <div><dt>Roles</dt><dd>{roles.length ? roles.join(", ") : "No roles assigned"}</dd></div>
                <div><dt>Locale</dt><dd>{session.membership.locale}</dd></div>
                <div><dt>Timezone</dt><dd>{session.membership.timezone}</dd></div>
              </dl>
            </section>

            <section aria-labelledby="profile-preferences-title">
              <header>
                <div>
                  <h2 id="profile-preferences-title">Communication preferences</h2>
                  <p>Choose channel, digest and quiet-hour preferences without changing institution-required notifications.</p>
                </div>
                <Link href="/communicate#notification-preferences">Manage preferences</Link>
              </header>
            </section>
          </main>

          <aside className="profile-account-rail" aria-label="Account actions">
            <section>
              <h2>Account security</h2>
              <p>Password, MFA, recovery codes and account lockouts remain with your institution's identity provider.</p>
              <div className="profile-action-list">
                {recoveryUrl ? <a href={recoveryUrl} rel="noreferrer">Password and MFA recovery</a> : <Link href="/account-help">Password and MFA help</Link>}
                {providerSupportUrl ? <a href={providerSupportUrl} rel="noreferrer">Identity-provider support</a> : null}
                <Link href="/account-help">Account access guidance</Link>
              </div>
            </section>

            <section>
              <h2>Workspace access</h2>
              <p>Institution administrators own membership, role assignment and access-policy decisions.</p>
              <div className="profile-action-list">
                <Link href="/select-workspace">Change active institution</Link>
                <Link href="/help">Get help with access</Link>
              </div>
            </section>

            <form action="/api/auth/sign-out" method="post" className="profile-signout-form">
              <button type="submit">Sign out of Veza</button>
              <small>This ends the current Veza browser session. It does not change your institution account.</small>
            </form>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
