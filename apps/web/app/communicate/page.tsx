import { AppShell } from "../../src/components/app-shell";
import { CommunicationsWorkspaceView } from "../../src/features/communications/communications-workspace";
import { loadCommunicationsWorkspace } from "../../src/server/communications-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function CommunicatePage() {
  const resolution = await requireWorkspaceSession();
  const workspace = await loadCommunicationsWorkspace();
  const roles = new Set(resolution.session.membership.roles);
  return (
    <AppShell session={resolution.session} active="communicate">
      <CommunicationsWorkspaceView
        workspace={workspace}
        canAdminister={roles.has("tenant-owner") || roles.has("institution-admin")}
      />
    </AppShell>
  );
}
