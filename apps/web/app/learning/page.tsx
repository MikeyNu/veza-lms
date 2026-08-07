import { notFound } from "next/navigation";
import type { BaselineRoleKey } from "@veza/contracts";
import { AppShell } from "../../src/components/app-shell";
import { CurriculumGovernanceWorkspace } from "../../src/features/catalogue/curriculum-governance-workspace";
import { DeliveryStructureActions } from "../../src/features/catalogue/delivery-structure-actions";
import { LearnerTodayWorkspace } from "../../src/features/learner/learner-workspaces";
import { primaryRole } from "../../src/features/workspace/navigation";
import { loadCatalogue, loadCatalogueReferences } from "../../src/server/catalogue-api";
import { loadLearnerToday } from "../../src/server/learning-platform-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

const staffRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
];

const deliveryManagerRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "course-manager",
];

export default async function LearningPage() {
  const resolution = await requireWorkspaceSession();
  const role = primaryRole(resolution.session);

  if (role === "learner") {
    const home = await loadLearnerToday();
    return (
      <AppShell session={resolution.session} active="learning">
        <LearnerTodayWorkspace home={home} />
      </AppShell>
    );
  }

  if (!resolution.session.membership.roles.some((candidate) => staffRoles.includes(candidate))) {
    notFound();
  }

  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();

  const [workspace, references] = await Promise.all([
    loadCatalogue(institutionId),
    loadCatalogueReferences(institutionId),
  ]);
  const canManageDelivery = resolution.session.membership.roles.some((candidate) =>
    deliveryManagerRoles.includes(candidate),
  );

  return (
    <AppShell session={resolution.session} active="learning">
      <CurriculumGovernanceWorkspace
        institutionId={institutionId}
        workspace={workspace}
        references={references}
        roles={resolution.session.membership.roles}
      />
      {canManageDelivery ? (
        <DeliveryStructureActions
          institutionId={institutionId}
          workspace={workspace}
          references={references}
        />
      ) : null}
    </AppShell>
  );
}
