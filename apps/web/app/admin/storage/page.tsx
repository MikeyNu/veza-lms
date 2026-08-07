import { redirect } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { AdminSectionNavigation } from "../../../src/features/admin/admin-section-navigation";
import { StorageAdministrationWorkspace } from "../../../src/features/admin/storage-administration-workspace";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";
import { loadStorageAdministration } from "../../../src/server/storage-api";

export const dynamic = "force-dynamic";

export default async function StorageAdministrationPage() {
  const { session } = await requireWorkspaceSession();
  const isAdministrator = session.membership.roles.some((role) =>
    role === "tenant-owner" || role === "institution-admin",
  );
  if (!isAdministrator) redirect("/");
  const workspace = await loadStorageAdministration();

  return (
    <AppShell session={session} active="admin">
      <AdminSectionNavigation active="storage"/>
      <StorageAdministrationWorkspace
        workspace={workspace}
        institutionId={session.membership.institutionIds[0]}
      />
    </AppShell>
  );
}
