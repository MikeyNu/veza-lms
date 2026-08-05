import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { AssessmentFinalControls } from "../../src/features/academic-evidence/assessment-final-controls";
import { AssessmentGovernanceCompletion } from "../../src/features/academic-evidence/academic-governance-completion";
import { AssessmentWorkspace } from "../../src/features/academic-evidence/academic-workspaces";
import { StaffGradebookDirectory } from "../../src/features/academic-evidence/staff-gradebook-workspace";
import { loadAcademicEvidenceWorkspace } from "../../src/server/academic-evidence-api";
import { loadCatalogue, loadCatalogueReferences } from "../../src/server/catalogue-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function AssessmentsPage() {
  const resolution = await requireWorkspaceSession();
  const allowed = [
    "tenant-owner",
    "institution-admin",
    "registrar",
    "course-manager",
    "instructor",
    "assessor",
    "moderator",
  ];
  if (!resolution.session.membership.roles.some((role) => allowed.includes(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const [workspace, catalogue, references] = await Promise.all([
    loadAcademicEvidenceWorkspace(institutionId),
    loadCatalogue(institutionId),
    loadCatalogueReferences(institutionId),
  ]);
  const roles = new Set(resolution.session.membership.roles);
  const canRelease =
    roles.has("moderator") || roles.has("tenant-owner") || roles.has("institution-admin");
  return (
    <AppShell session={resolution.session} active="assessments">
      <AssessmentWorkspace
        institutionId={institutionId}
        workspace={workspace}
        catalogue={catalogue}
        references={references}
      />
      <AssessmentGovernanceCompletion
        institutionId={institutionId}
        workspace={workspace}
        references={references}
        canApprove={roles.has("moderator")}
        canRelease={canRelease}
      />
      <AssessmentFinalControls
        institutionId={institutionId}
        workspace={workspace}
        references={references}
        canRelease={canRelease}
      />
      <StaffGradebookDirectory gradebooks={workspace.gradebooks} />
    </AppShell>
  );
}
