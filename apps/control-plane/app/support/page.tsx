import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { SupportOperationsWorkspace } from "../../src/features/support/support-operations-workspace";
import { loadSupportOperations } from "../../src/server/control-plane-operations-api";
import { requireOperatorSession } from "../../src/server/operator-session";
import { loadTenantFleet } from "../../src/server/tenant-fleet-api";

export const dynamic = "force-dynamic";

export default async function SupportOperationsPage() {
  const session = await requireOperatorSession();
  const [support, tenants] = await Promise.all([
    loadSupportOperations(session.oidc.accessToken),
    loadTenantFleet(session.oidc.accessToken, { limit: 100 }),
  ]);
  return (
    <ControlPlaneShell
      active="/support"
      principal={session.principal}
      environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}
    >
      <SupportOperationsWorkspace support={support} tenants={tenants.items}/>
    </ControlPlaneShell>
  );
}
