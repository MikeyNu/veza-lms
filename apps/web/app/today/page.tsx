import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { LearnerTodayWorkspace } from "../../src/features/learner/learner-workspaces";
import { loadLearnerToday } from "../../src/server/learning-platform-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const resolution = await requireWorkspaceSession();
  if (!resolution.session.membership.roles.includes("learner")) notFound();
  const home = await loadLearnerToday();
  return <AppShell session={resolution.session} active="home"><LearnerTodayWorkspace home={home} /></AppShell>;
}
