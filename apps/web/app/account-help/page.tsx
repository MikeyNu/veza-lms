import { ButtonLink, Icon } from "@veza/ui";
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
      context="Account help"
      title="Route the problem to the system that owns it."
      description="Credential and MFA problems belong to your institution's identity provider. Workspace membership and role scope belong to your institution administrator."
      aside={<><strong>Veza does not store your institution password.</strong><span>This page cannot inspect, reset or bypass your credentials. It routes each issue to the authority that owns it.</span></>}
      footer={<>Never share an invitation token, password, recovery code or MFA code with Veza support or an institution administrator.</>}
    >
      <IdentitySteps items={[
        { label: "Identify the failure", detail: "Decide whether sign-in failed or sign-in succeeded without a workspace.", state: "current" },
        { label: "Use the correct owner", detail: "Credential problems go to the identity provider. Membership problems go to the institution administrator." },
        { label: "Return and verify", detail: "Retry sign-in and confirm the expected institution and role before opening data." },
      ]} />

      <div className="identity-action-stack">
        {recoveryUrl ? (
          <ButtonLink className="identity-full-action" href={recoveryUrl} rel="noreferrer" trailingIcon={<Icon name="external-link" />}>
            Open institution account recovery
          </ButtonLink>
        ) : (
          <IdentityStatus tone="warning" title="Account recovery is not configured">
            Contact your institution's IT service desk for password, MFA or locked-account assistance.
          </IdentityStatus>
        )}
        {providerSupportUrl ? (
          <ButtonLink className="identity-full-action" variant="secondary" href={providerSupportUrl} rel="noreferrer" trailingIcon={<Icon name="external-link" />}>
            Open identity-provider support
          </ButtonLink>
        ) : null}
        <ButtonLink className="identity-full-action" variant="secondary" href="/sign-in">Return to secure sign-in</ButtonLink>
      </div>
    </IdentityGateway>
  );
}
