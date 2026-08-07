import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { resolveNavigation, type NavigationKey } from "../../src/features/workspace/navigation";
import { WorkspaceSectionPage } from "../../src/features/workspace/workspace-section-page";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

const fallbackKeys = new Set<NavigationKey>(["calendar", "support"]);

export default async function WorkspaceRoute({ params }: { params: Promise<{ workspace: string[] }> }) {
  const [{ workspace }, resolution] = await Promise.all([params, requireWorkspaceSession()]);
  if (workspace.length !== 1) notFound();
  const section = workspace[0] as NavigationKey | undefined;
  if (!section || !fallbackKeys.has(section)) notFound();
  const allowed = resolveNavigation(resolution.session).some((item) => item.key === section);
  if (!allowed) notFound();
  return <AppShell session={resolution.session} active={section}><WorkspaceSectionPage session={resolution.session} section={section as Exclude<NavigationKey, "home">}/></AppShell>;
}
