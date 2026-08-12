import { redirect } from "next/navigation";
import { AppShell } from "../src/components/app-shell";
import { LearnerTodayWorkspace } from "../src/features/learner/learner-today-workspace";
import { canonicalLandingPathForRoles } from "../src/features/workspace/access-policy";
import { primaryRole } from "../src/features/workspace/navigation";
import { WorkspaceHome } from "../src/features/workspace/workspace-home";
import { loadLearnerToday } from "../src/server/learning-platform-api";
import { resolveWorkspaceSession } from "../src/server/workspace-session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const resolution = await resolveWorkspaceSession();
  if (resolution.status === "signed-out") redirect("/sign-in");
  if (resolution.status === "select-workspace") redirect("/select-workspace");
  if (resolution.status === "access-pending") redirect("/access-pending");

  const landing = canonicalLandingPathForRoles(resolution.session.membership.roles);
  if (landing !== "/") redirect(landing);

  const role = primaryRole(resolution.session);
  const content = role === "learner"
    ? <LearnerTodayWorkspace home={await loadLearnerToday()} />
    : <WorkspaceHome session={resolution.session} />;

  return <AppShell session={resolution.session}>{content}</AppShell>;
}
