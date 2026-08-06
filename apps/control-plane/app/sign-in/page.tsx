import { redirect } from "next/navigation";
import { OperatorIdentityGateway, OperatorStatus } from "../../src/components/operator-identity-gateway";
import { getOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";

const messages: Readonly<Record<string, string>> = {
  invalid_callback: "The identity response was incomplete. Start a new secure operator sign-in.",
  provider_error: "The identity provider did not complete operator sign-in.",
  operator_access_required: "This account must hold the Veza platform-operator role and satisfy the configured multi-factor assurance.",
  authentication_failed: "The secure operator exchange could not be completed. No control-plane session was created.",
};

export default async function ControlPlaneSignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, { error }] = await Promise.all([getOperatorSession(), searchParams]);
  if (session) redirect("/tenants/new");

  return (
    <OperatorIdentityGateway
      eyebrow="PRIVILEGED OPERATOR ACCESS"
      title="Enter the fleet control boundary."
      description="Use the dedicated operator identity client. Veza requires the platform-operator claim and the configured MFA assurance before creating a control-plane session."
    >
      {error ? <OperatorStatus>{messages[error] ?? "Operator access could not be verified."}</OperatorStatus> : null}
      <a className="operator-primary" href="/api/auth/sign-in">Continue with operator SSO <span aria-hidden="true">→</span></a>
      <aside><strong>Separate by design</strong><p>This session can govern tenancy, commercial policy, release and support elevation. It does not provide a route into tenant learning records.</p></aside>
    </OperatorIdentityGateway>
  );
}
