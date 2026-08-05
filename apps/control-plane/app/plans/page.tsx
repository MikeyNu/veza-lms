import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { CommercialGovernanceWorkspace } from "../../src/features/plans/commercial-governance-workspace";
import { loadCommercialGovernance } from "../../src/server/commercial-release-api";
import { requireOperatorSession } from "../../src/server/operator-session";
import { loadTenantFleet } from "../../src/server/tenant-fleet-api";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const session = await requireOperatorSession();
  const [commercial, tenants] = await Promise.all([
    loadCommercialGovernance(session.oidc.accessToken),
    loadTenantFleet(session.oidc.accessToken, { limit: 100 }),
  ]);
  return (
    <ControlPlaneShell
      active="/plans"
      principal={session.principal}
      environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}
    >
      <CommercialGovernanceWorkspace commercial={commercial} tenants={tenants.items}/>
    </ControlPlaneShell>
  );
}
