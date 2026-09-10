import { Button, ButtonLink, Icon, Link as VezaLink } from "@veza/ui";
import {
  IdentityGateway,
  IdentityStatus,
  IdentitySteps,
} from "../../src/components/identity/identity-gateway";
import { getWebOidcSession } from "../../src/server/web-session";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const errors: Readonly<Record<string, { readonly title: string; readonly detail: string }>> = {
  invalid: {
    title: "This invitation link is incomplete",
    detail: "Request a new invitation from your institution administrator. Do not copy only part of the link.",
  },
  session: {
    title: "Your identity session has expired",
    detail: "Start a fresh sign-in, then Veza will return you to this invitation.",
  },
  identity: {
    title: "This invitation belongs to another identity",
    detail: "Use the exact verified email address that received the invitation.",
  },
  "not-found": {
    title: "The invitation could not be found",
    detail: "It may have been withdrawn or replaced. Ask the institution administrator for a current invitation.",
  },
  accepted: {
    title: "This invitation has already been accepted",
    detail: "The one-time invitation cannot be used again. Continue to your existing workspace membership instead.",
  },
  expired: {
    title: "This invitation is no longer active",
    detail: "It expired or was revoked. A new invitation is required before Veza can create the membership.",
  },
  service: {
    title: "Veza could not complete invitation acceptance",
    detail: "No membership transition was confirmed. You can retry without requesting a new invitation.",
  },
};

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ invitationId?: string; token?: string; error?: string }>;
}) {
  const [session, query] = await Promise.all([getWebOidcSession(), searchParams]);
  const invitationId = query.invitationId ?? "";
  const token = query.token ?? "";
  const valid = uuidPattern.test(invitationId) && token.length >= 32 && token.length <= 2048;
  const errorCode = query.error ?? "";
  const error = errorCode ? errors[errorCode] : undefined;
  const returnParameters = valid ? new URLSearchParams({ invitationId, token }) : undefined;
  const returnTo = returnParameters ? `/invitation?${returnParameters}` : "/invitation";
  const needsFreshIdentity = errorCode === "session" || errorCode === "identity";
  const invitationConsumed = errorCode === "accepted";
  const invitationInactive = errorCode === "not-found" || errorCode === "expired";
  const canAttemptAcceptance = !errorCode || errorCode === "service";

  const freshSignInPath = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
  const workspaceSignInPath = `/sign-in?returnTo=${encodeURIComponent("/select-workspace")}`;

  return (
    <IdentityGateway
      context="Institution invitation"
      title="Verify the invited identity before activating membership."
      description="Acceptance links one verified identity to one tenant membership and role scope. The token is consumed only after the identity email and invitation evidence match."
      aside={<><strong>Check the account before accepting.</strong><span>The signed-in email must be the verified address that received the invitation. Acceptance cannot be transferred to another identity.</span></>}
      footer={<>Invitation acceptance is atomic. Membership activation, role assignment, audit evidence and the activation event either commit together or do not commit.</>}
    >
      {error ? <IdentityStatus tone={invitationConsumed ? "warning" : "danger"} title={error.title}>{error.detail}</IdentityStatus> : null}
      {!valid ? (
        <div className="identity-action-stack">
          {!error ? <IdentityStatus tone="danger" title="Invitation details are invalid">Request a complete invitation link from your institution administrator.</IdentityStatus> : null}
          <ButtonLink className="identity-full-action" variant="secondary" href="/sign-in">Return to sign-in</ButtonLink>
          <VezaLink variant="quiet" href="/account-help">Invitation or account help</VezaLink>
        </div>
      ) : (
        <>
          <IdentitySteps items={[
            { label: "Invitation received", detail: "The one-time invitation token is present.", state: "complete" },
            { label: "Identity verification", detail: session ? `Signed in as ${session.profile.email ?? session.profile.displayName ?? "a verified account"}.` : "Sign in with the invited email address.", state: session ? "complete" : "current" },
            {
              label: "Membership activation",
              detail: invitationConsumed
                ? "This invitation has already completed its one-time activation step."
                : invitationInactive
                  ? "A current invitation is required before membership can be activated."
                  : "Veza will verify the token, email, expiry and invitation state before activation.",
              ...(invitationConsumed ? { state: "complete" as const } : session && !invitationInactive ? { state: "current" as const } : {}),
            },
          ]} />
          <div className="identity-action-stack">
            {invitationConsumed ? (
              session ? (
                <ButtonLink className="identity-full-action" href="/select-workspace" trailingIcon={<Icon name="arrow" />}>
                  Open workspace selection
                </ButtonLink>
              ) : (
                <ButtonLink className="identity-full-action" href={workspaceSignInPath} trailingIcon={<Icon name="arrow" />}>
                  Sign in to open your workspace
                </ButtonLink>
              )
            ) : invitationInactive ? (
              session ? (
                <ButtonLink className="identity-full-action" variant="secondary" href="/select-workspace">
                  Open existing workspaces
                </ButtonLink>
              ) : (
                <ButtonLink className="identity-full-action" variant="secondary" href="/sign-in">
                  Return to sign-in
                </ButtonLink>
              )
            ) : needsFreshIdentity && session ? (
              <form action="/api/auth/sign-out" method="post" className="identity-action-stack">
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button className="identity-full-action" type="submit" trailingIcon={<Icon name="arrow" />}>
                  Sign in with the invited identity
                </Button>
              </form>
            ) : session && canAttemptAcceptance ? (
              <form action="/api/invitations/accept" method="post" className="identity-action-stack">
                <input type="hidden" name="invitationId" value={invitationId} />
                <input type="hidden" name="token" value={token} />
                <Button className="identity-full-action" type="submit" trailingIcon={<Icon name="arrow" />}>
                  {errorCode === "service" ? "Retry invitation acceptance" : "Accept invitation and open workspace"}
                </Button>
              </form>
            ) : (
              <ButtonLink className="identity-full-action" href={freshSignInPath} trailingIcon={<Icon name="arrow" />}>
                Sign in to verify this invitation
              </ButtonLink>
            )}

            {session && !needsFreshIdentity && !invitationConsumed && !invitationInactive ? (
              <form action="/api/auth/sign-out" method="post">
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button className="identity-full-action" variant="secondary" type="submit">Use another identity</Button>
              </form>
            ) : null}
            <VezaLink variant="quiet" href="/account-help">Invitation or account help</VezaLink>
          </div>
        </>
      )}
    </IdentityGateway>
  );
}
