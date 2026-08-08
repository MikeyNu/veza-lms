import { AppShell } from "../../src/components/app-shell";
import { RecipientCommunicationsWorkspaceView } from "../../src/features/communications/recipient-communications-workspace";
import { CommunicationsWorkspaceView } from "../../src/features/communications/communications-workspace";
import {
  loadCommunicationsWorkspace,
  loadRecipientCommunicationsWorkspace,
} from "../../src/server/communications-api";
import { requireWorkspaceAccess } from "../../src/server/require-workspace-access";

export const dynamic = "force-dynamic";

export default async function CommunicatePage() {
  const resolution = await requireWorkspaceAccess("/communicate");
  const roles = new Set(resolution.session.membership.roles);
  const canAdminister = roles.has("tenant-owner") || roles.has("institution-admin");

  if (!canAdminister) {
    const workspace = await loadRecipientCommunicationsWorkspace();
    return (
      <AppShell session={resolution.session} active="communicate">
        <RecipientCommunicationsWorkspaceView
          workspace={workspace}
          timezone={resolution.session.membership.timezone}
          institutionName={resolution.session.tenant.displayName}
        />
      </AppShell>
    );
  }

  const workspace = await loadCommunicationsWorkspace();
  return (
    <AppShell session={resolution.session} active="communicate">
      <CommunicationsWorkspaceView workspace={workspace} canAdminister />
    </AppShell>
  );
}
