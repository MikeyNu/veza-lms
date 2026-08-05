import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { AssessmentWorkspace } from "../../src/features/academic-evidence/academic-workspaces";
import { loadAcademicEvidenceWorkspace } from "../../src/server/academic-evidence-api";
import { loadCatalogue, loadCatalogueReferences } from "../../src/server/catalogue-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function AssessmentsPage() {
  const resolution = await requireWorkspaceSession();
  const allowed = ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor", "assessor", "moderator"];
  if (!resolution.session.membership.roles.some((role) => allowed.includes(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const [workspace, catalogue, references] = await Promise.all([loadAcademicEvidenceWorkspace(institutionId), loadCatalogue(institutionId), loadCatalogueReferences(institutionId)]);
  return <AppShell session={resolution.session} active="assessments"><AssessmentWorkspace institutionId={institutionId} workspace={workspace} catalogue={catalogue} references={references} /></AppShell>;
}
