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
      eyebrow="PASSWORD RECOVERY"
      title="Reset your password with the system that owns it."
      description="Veza delegates passwords, account locks and MFA recovery to your institution's identity provider. This keeps learning data separate from credential administration."
      stage="Identity-provider handoff"
      aside={<><strong>Why there is no password form here</strong><span>A Veza-hosted reset form would duplicate institutional identity controls and create an unsafe credential boundary.</span></>}
      footer={<>After recovery, return to Veza and start a new sign-in. Existing failed sign-in transactions are not reused.</>}
    >
      <IdentitySteps items={[
        { label: "Open institutional recovery", detail: "Continue only to the configured identity-provider recovery address.", state: "current" },
        { label: "Complete verification", detail: "Use the verification and MFA process required by your institution." },
        { label: "Start a new Veza sign-in", detail: "Return here after recovery so Veza receives a fresh verified identity response." },
      ]} />
      <div className="identity-action-stack">
        {recoveryUrl ? (
          <a className="identity-primary" href={recoveryUrl} rel="noreferrer">
            Continue to password recovery <span aria-hidden="true">→</span>
          </a>
        ) : (
          <IdentityStatus tone="warning" title="Password recovery is not configured">
            Contact your institution's IT service desk. Ask for the official password or account-recovery address before entering credentials anywhere.
          </IdentityStatus>
        )}
        <a className="identity-secondary" href="/sign-in">Return to sign-in</a>
        <a className="identity-text-link" href="/account-help">Review all account-help options</a>
      </div>
    </IdentityGateway>
  );
}
