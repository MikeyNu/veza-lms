import { AppShell } from "../../src/components/app-shell";
import { CurriculumGovernanceWorkspace } from "../../src/features/catalogue/curriculum-governance-workspace";
import { LearnerTodayWorkspace } from "../../src/features/learner/learner-today-workspace";
import { primaryRole } from "../../src/features/workspace/navigation";
import { loadCatalogue, loadCatalogueReferences } from "../../src/server/catalogue-api";
import { loadLearnerToday } from "../../src/server/learning-platform-api";
import { requireWorkspaceAccess } from "../../src/server/require-workspace-access";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const resolution = await requireWorkspaceAccess("/learning");
  const role = primaryRole(resolution.session);
  if (role === "learner") {
    const home = await loadLearnerToday();
    return <AppShell session={resolution.session} active="learning"><LearnerTodayWorkspace home={home}/></AppShell>;
  }
  const institutionId = resolution.session.membership.institutionIds[0] ?? "";
  const [catalogue, references] = await Promise.all([
    loadCatalogue(institutionId),
    loadCatalogueReferences(institutionId),
  ]);
  return <AppShell session={resolution.session} active="learning"><CurriculumGovernanceWorkspace institutionId={institutionId} workspace={catalogue} references={references} roles={resolution.session.membership.roles}/></AppShell>;
}
