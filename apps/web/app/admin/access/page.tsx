import { redirect } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { AccessAdministrationWorkspace } from "../../../src/features/admin/access-administration-workspace";
import { AdminSectionNavigation } from "../../../src/features/admin/admin-section-navigation";
import { loadAccessDirectory } from "../../../src/server/access-directory-api";
import { loadTenantSetupBundle } from "../../../src/server/institution-setup-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function AccessAdministrationPage() {
  const session = await requireWorkspaceSession();
  const administrator = session.membership.roles.some((role) => role === "tenant-owner" || role === "institution-admin");
  if (!administrator) redirect("/");
  const [directory, setup] = await Promise.all([loadAccessDirectory(), loadTenantSetupBundle()]);
  return <AppShell session={session} active="admin"><AdminSectionNavigation active="access" /><AccessAdministrationWorkspace directory={directory} tenantId={session.tenant.id} institutions={setup.institutions} tenantOwner={session.membership.roles.includes("tenant-owner")} /></AppShell>;
}
