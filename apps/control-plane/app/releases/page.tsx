import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { ReleaseManagementWorkspace } from "../../src/features/releases/release-management-workspace";
import { loadReleaseCompletion } from "../../src/server/commercial-release-api";
import { requireOperatorSession } from "../../src/server/operator-session";
import { loadTenantFleet } from "../../src/server/tenant-fleet-api";

export const dynamic = "force-dynamic";

export default async function ReleaseManagementPage() {
  const session = await requireOperatorSession();
  const [release, tenants] = await Promise.all([
    loadReleaseCompletion(session.oidc.accessToken),
    loadTenantFleet(session.oidc.accessToken, { limit: 100 }),
  ]);
  return (
    <ControlPlaneShell
      active="/releases"
      principal={session.principal}
      environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}
    >
      <ReleaseManagementWorkspace release={release} tenants={tenants.items}/>
    </ControlPlaneShell>
  );
}
