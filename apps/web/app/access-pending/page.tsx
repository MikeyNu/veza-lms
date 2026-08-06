import { redirect } from "next/navigation";
import {
  IdentityGateway,
  IdentityStatus,
  IdentitySteps,
} from "../../src/components/identity/identity-gateway";
import { getWebOidcSession } from "../../src/server/web-session";

export const dynamic = "force-dynamic";

export default async function AccessPendingPage() {
  const session = await getWebOidcSession();
  if (!session) redirect("/sign-in");

  return (
    <IdentityGateway
      eyebrow="IDENTITY VERIFIED"
      title="No active institutional membership is available yet."
      description="Sign-in completed successfully, but Veza did not find a current membership that can establish tenant context. No institutional records have been opened."
      stage="Access pending"
      aside={<><strong>Membership is controlled by your institution.</strong><span>Only an authorised institution administrator can issue, reactivate or change your membership and role scope.</span></>}
      footer={<>Signing out clears the current identity session but does not cancel or change an invitation.</>}
    >
      <IdentityStatus tone="warning" title="Workspace access is not assigned">
        Contact the person who invited you or your institution administrator and ask them to confirm the invitation, membership status and validity dates.
      </IdentityStatus>
      <IdentitySteps items={[
        { label: "Identity verified", detail: "The configured identity provider completed sign-in.", state: "complete" },
        { label: "Membership required", detail: "An active Veza membership must link this identity to an institution.", state: "current" },
        { label: "Workspace selection", detail: "After activation, sign in again and choose the verified workspace." },
      ]} />
      <div className="identity-action-stack">
        <a className="identity-secondary" href="/select-workspace">Check memberships again</a>
        <a className="identity-text-link" href="/account-help">Review access guidance</a>
        <form action="/api/auth/sign-out" method="post">
          <button className="identity-secondary" type="submit">Sign out</button>
        </form>
      </div>
    </IdentityGateway>
  );
}
