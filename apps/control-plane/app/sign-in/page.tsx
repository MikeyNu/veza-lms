import { redirect } from "next/navigation";
import { getOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";

const messages: Readonly<Record<string, string>> = {
  invalid_callback: "The identity response was incomplete. Start a new secure sign-in.",
  provider_error: "The identity provider did not complete operator sign-in.",
  operator_access_required: "This account must hold the Veza platform-operator role and satisfy the required multi-factor assurance.",
  authentication_failed: "The secure sign-in exchange could not be completed.",
};

export default async function ControlPlaneSignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, { error }] = await Promise.all([getOperatorSession(), searchParams]);
  if (session) redirect("/tenants/new");

  return <main className="cp-auth-page"><section className="cp-auth-panel">
    <div className="cp-brand cp-auth-brand"><span>V</span><div><strong>veza</strong><small>CONTROL PLANE</small></div></div>
    <p className="section-kicker">PRIVILEGED ACCESS</p>
    <h1>Operate the fleet without entering tenant content.</h1>
    <p>Control-plane access requires a verified platform-operator claim, the configured multi-factor assurance, and a separate operator session.</p>
    {error ? <p className="cp-auth-error" role="alert">{messages[error] ?? "Access could not be verified."}</p> : null}
    <a className="button-primary cp-auth-action" href="/api/auth/sign-in">Continue with operator SSO</a>
    <small>All provisioning and entitlement changes produce audit evidence.</small>
  </section></main>;
}
