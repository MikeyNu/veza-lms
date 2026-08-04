import { redirect } from "next/navigation";
import { AppShell } from "../src/components/app-shell";
import { WorkspaceHome } from "../src/features/workspace/workspace-home";
import { resolveWorkspaceSession } from "../src/server/workspace-session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const resolution = await resolveWorkspaceSession();
  if (resolution.status === "signed-out") redirect("/sign-in");
  if (resolution.status === "select-workspace") redirect("/select-workspace");
  if (resolution.status === "access-pending") redirect("/access-pending");
  return <AppShell session={resolution.session}><WorkspaceHome session={resolution.session} demo={resolution.demo}/></AppShell>;
}
