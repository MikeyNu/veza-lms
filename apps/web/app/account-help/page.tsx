import {
  IdentityGateway,
  IdentityStatus,
  IdentitySteps,
} from "../../src/components/identity/identity-gateway";
import {
  identityProviderRecoveryUrl,
  identityProviderSupportUrl,
} from "../../src/server/identity-provider-links";

export const dynamic = "force-dynamic";

export default function AccountHelpPage() {
  const recoveryUrl = identityProviderRecoveryUrl();
  const providerSupportUrl = identityProviderSupportUrl();

  return (
    <IdentityGateway
      eyebrow="ACCOUNT HELP"
      title="Resolve the right access problem without weakening identity controls."
      description="Account credentials and MFA belong to your institution's identity provider. Workspace membership and role scope belong to your institution administrator."
      stage="Recovery guidance"
      aside={<><strong>Veza does not store your institution password.</strong><span>This page cannot inspect, reset or bypass your credentials. It routes each issue to the authority that owns it.</span></>}
      footer={<>Never share an invitation token, password, recovery code or MFA code with Veza support or an institution administrator.</>}
    >
      <IdentitySteps items={[
        { label: "Identify the failure", detail: "Decide whether sign-in failed or sign-in succeeded without a workspace.", state: "current" },
        { label: "Use the correct owner", detail: "Credential problems go to the identity provider. Membership problems go to the institution administrator." },
        { label: "Return and verify", detail: "Retry sign-in and confirm that the expected institution and role are shown before opening data." },
      ]} />

      <div className="identity-action-stack">
        {recoveryUrl ? (
          <a className="identity-primary" href={recoveryUrl} rel="noreferrer">
            Open institution account recovery <span aria-hidden="true">→</span>
          </a>
        ) : (
          <IdentityStatus tone="warning" title="Account recovery is not configured">
            Contact your institution's IT service desk for password, MFA or locked-account assistance.
          </IdentityStatus>
        )}
        {providerSupportUrl ? <a className="identity-secondary" href={providerSupportUrl} rel="noreferrer">Open identity-provider support</a> : null}
        <a className="identity-secondary" href="/sign-in">Return to secure sign-in</a>
      </div>
    </IdentityGateway>
  );
}
