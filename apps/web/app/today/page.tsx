import { AppShell } from "../../src/components/app-shell";
import { LearnerTodayWorkspace } from "../../src/features/learner/learner-today-workspace";
import { loadLearnerToday } from "../../src/server/learning-platform-api";
import { requireWorkspaceAccess } from "../../src/server/require-workspace-access";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const resolution = await requireWorkspaceAccess("/today");
  const home = await loadLearnerToday();
  return <AppShell session={resolution.session} active="home"><LearnerTodayWorkspace home={home}/></AppShell>;
}
