import { notFound } from "next/navigation";
import type { BaselineRoleKey } from "@veza/contracts";
import { AppShell } from "../../src/components/app-shell";
import { CatalogueGovernanceControls } from "../../src/features/catalogue/catalogue-governance-controls";
import { CatalogueWorkspaceView } from "../../src/features/catalogue/catalogue-workspace";
import { loadCatalogue, loadCatalogueReferences } from "../../src/server/catalogue-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";
const roles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
];

export default async function LearningPage() {
  const resolution = await requireWorkspaceSession();
  if (!resolution.session.membership.roles.some((role) => roles.includes(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const [workspace, references] = await Promise.all([
    loadCatalogue(institutionId),
    loadCatalogueReferences(institutionId),
  ]);
  const roleSet = new Set(resolution.session.membership.roles);
  const canManageCurriculum = ["tenant-owner", "institution-admin", "curriculum-manager"].some((role) => roleSet.has(role as BaselineRoleKey));
  const canManageDelivery = ["tenant-owner", "institution-admin", "registrar", "course-manager"].some((role) => roleSet.has(role as BaselineRoleKey));
  return (
    <AppShell session={resolution.session} active="learning">
      <CatalogueWorkspaceView
        institutionId={institutionId}
        workspace={workspace}
        references={references}
        roles={resolution.session.membership.roles}
      />
      <CatalogueGovernanceControls
        institutionId={institutionId}
        workspace={workspace}
        references={references}
        canManageCurriculum={canManageCurriculum}
        canManageDelivery={canManageDelivery}
      />
    </AppShell>
  );
}
