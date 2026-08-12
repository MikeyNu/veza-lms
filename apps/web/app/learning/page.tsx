import { AppShell } from "../../src/components/app-shell";
import { CurriculumGovernanceWorkspace } from "../../src/features/catalogue/curriculum-governance-workspace";
import { LearnerTodayWorkspace } from "../../src/features/learner/learner-today-workspace";
import { primaryRole } from "../../src/features/workspace/navigation";
import { loadCatalogueWorkspace } from "../../src/server/catalogue-api";
import { loadLearnerToday } from "../../src/server/learning-platform-api";
import { requireWorkspaceAccess } from "../../src/server/workspace-route-guard";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const resolution = await requireWorkspaceAccess("/learning");
  const role = primaryRole(resolution.session);
  if (role === "learner") {
    const home = await loadLearnerToday();
    return <AppShell session={resolution.session} active="learning"><LearnerTodayWorkspace home={home}/></AppShell>;
  }
  const institutionId = resolution.session.membership.institutionIds[0] ?? "";
  const catalogue = await loadCatalogueWorkspace(institutionId);
  return <AppShell session={resolution.session} active="learning"><CurriculumGovernanceWorkspace institutionId={institutionId} workspace={catalogue}/></AppShell>;
}
