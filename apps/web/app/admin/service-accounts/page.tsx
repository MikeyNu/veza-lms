import { redirect } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { AdminSectionNavigation } from "../../../src/features/admin/admin-section-navigation";
import { ServiceAccountWorkspace } from "../../../src/features/admin/service-account-workspace";
import { loadServiceAccounts } from "../../../src/server/service-account-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function ServiceAccountsPage() {
  const session = await requireWorkspaceSession();
  const isAdministrator = session.membership.roles.some((role) =>
    role === "tenant-owner" || role === "institution-admin",
  );
  if (!isAdministrator) redirect("/");
  const directory = await loadServiceAccounts();

  return (
    <AppShell session={session} active="admin">
      <AdminSectionNavigation active="service-accounts"/>
      <ServiceAccountWorkspace
        directory={directory}
        currentUserId={session.principal.userId}
      />
    </AppShell>
  );
}
