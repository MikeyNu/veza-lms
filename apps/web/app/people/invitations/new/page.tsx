import { notFound } from "next/navigation";
import { AppShell } from "../../../../src/components/app-shell";
import { TenantOwnerInvitationForm } from "../../../../src/features/workspace/tenant-owner-invitation-form";
import { requireWorkspaceSession } from "../../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function NewTenantOwnerInvitationPage() {
  const resolution = await requireWorkspaceSession();
  if (!resolution.session.membership.roles.includes("tenant-owner")) notFound();
  return <AppShell session={resolution.session} active="people"><section className="workspace form-workspace" aria-labelledby="invite-owner-title">
    <header><p className="eyebrow">TENANT ACCESS</p><h1 id="invite-owner-title">Invite another tenant owner</h1><p>Tenant owners can configure licensing, institutions and privileged memberships. Use this role only for accountable institutional leadership.</p></header>
    <article className="form-card"><div><p className="eyebrow">ROLE SCOPE</p><h2>{resolution.session.tenant.displayName}</h2><p>Tenant-wide · audited · one-time activation</p></div><TenantOwnerInvitationForm/></article>
  </section></AppShell>;
}
