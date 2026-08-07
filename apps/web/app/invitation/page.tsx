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
    detail: "Start sign-in again, then return to this invitation link.",
  },
  identity: {
    title: "This invitation belongs to another identity",
    detail: "Sign out and use the exact verified email address that received the invitation.",
  },
  "not-found": {
    title: "The invitation could not be found",
    detail: "It may have been withdrawn or replaced. Ask the institution administrator for a current invitation.",
  },
  accepted: {
    title: "This invitation has already been accepted",
    detail: "Continue to workspace selection. If no workspace appears, ask the institution administrator to inspect membership status.",
  },
  expired: {
    title: "This invitation is no longer active",
    detail: "It expired or was revoked. A new invitation is required before Veza can create the membership.",
  },
  service: {
    title: "Veza could not complete invitation acceptance",
    detail: "No membership transition was confirmed. Retry when the service is available.",
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
  const error = query.error ? errors[query.error] : undefined;
  const returnParameters = valid ? new URLSearchParams({ invitationId, token }) : undefined;
  const returnTo = returnParameters ? `/invitation?${returnParameters}` : "/invitation";

  return (
    <IdentityGateway
      eyebrow="INSTITUTION INVITATION"
      title="Join the institution through a verified identity and scoped membership."
      description="Acceptance links one verified identity to one tenant membership and role scope. The token is consumed only after the identity email and invitation evidence match."
      stage="Invitation acceptance"
      aside={<><strong>Check the account before accepting.</strong><span>The signed-in email must be the same verified address that received the invitation. Acceptance cannot be transferred to another identity.</span></>}
      footer={<>Invitation acceptance is atomic. Membership activation, role assignment, audit evidence and the activation event either commit together or do not commit.</>}
    >
      {error ? <IdentityStatus tone="danger" title={error.title}>{error.detail}</IdentityStatus> : null}
      {!valid ? (
        <div className="identity-action-stack">
          {!error ? <IdentityStatus tone="danger" title="Invitation details are invalid">Request a complete invitation link from your institution administrator.</IdentityStatus> : null}
          <a className="identity-secondary" href="/sign-in">Return to sign-in</a>
        </div>
      ) : (
        <>
          <IdentitySteps items={[
            { label: "Invitation received", detail: "The one-time invitation token is present.", state: "complete" },
            { label: "Identity verification", detail: session ? `Signed in as ${session.profile.email ?? session.profile.displayName ?? "a verified account"}.` : "Sign in with the invited email address.", state: session ? "complete" : "current" },
            { label: "Membership activation", detail: "Veza will verify the token, email, expiry and invitation state before activation.", ...(session ? { state: "current" as const } : {}) },
          ]} />
          <div className="identity-action-stack">
            {session ? (
              <form action="/api/invitations/accept" method="post" className="identity-action-stack">
                <input type="hidden" name="invitationId" value={invitationId} />
                <input type="hidden" name="token" value={token} />
                <button className="identity-primary" type="submit">
                  Accept invitation and open workspace <span aria-hidden="true">→</span>
                </button>
              </form>
            ) : (
              <a className="identity-primary" href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
                Sign in to verify this invitation <span aria-hidden="true">→</span>
              </a>
            )}
            {session ? <form action="/api/auth/sign-out" method="post"><button className="identity-secondary" type="submit">Use another identity</button></form> : null}
            <a className="identity-text-link" href="/account-help">Invitation or account help</a>
          </div>
        </>
      )}
    </IdentityGateway>
  );
}
