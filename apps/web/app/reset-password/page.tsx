import { ButtonLink, Icon, Link as VezaLink } from "@veza/ui";
import {
  IdentityGateway,
  IdentityStatus,
  IdentitySteps,
} from "../../src/components/identity/identity-gateway";
import { identityProviderRecoveryUrl } from "../../src/server/identity-provider-links";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  const recoveryUrl = identityProviderRecoveryUrl();

  return (
    <IdentityGateway
      context="Password recovery"
      title="Reset your password with your institution's identity provider."
      description="Veza does not own passwords, account locks or MFA recovery. Those controls stay with the identity provider configured by your institution."
      aside={<><strong>Why there is no password form here</strong><span>A Veza-hosted reset form would duplicate institutional identity controls and create an unsafe credential boundary.</span></>}
      footer={<>After recovery, return to Veza and start a new sign-in. Existing failed sign-in transactions are not reused.</>}
    >
      <IdentitySteps items={[
        { label: "Open institutional recovery", detail: "Continue only to the configured identity-provider recovery address.", state: "current" },
        { label: "Complete verification", detail: "Use the verification and MFA process required by your institution." },
        { label: "Start a new Veza sign-in", detail: "Return after recovery so Veza receives a fresh verified identity response." },
      ]} />
      <div className="identity-action-stack">
        {recoveryUrl ? (
          <ButtonLink className="identity-full-action" href={recoveryUrl} rel="noreferrer" trailingIcon={<Icon name="external-link" />}>
            Continue to password recovery
          </ButtonLink>
        ) : (
          <IdentityStatus tone="warning" title="Password recovery is not configured">
            Contact your institution's IT service desk. Ask for the official password or account-recovery address before entering credentials anywhere.
          </IdentityStatus>
        )}
        <ButtonLink className="identity-full-action" variant="secondary" href="/sign-in">Return to sign-in</ButtonLink>
        <VezaLink variant="quiet" href="/account-help">Review all account-help options</VezaLink>
      </div>
    </IdentityGateway>
  );
}
