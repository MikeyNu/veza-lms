import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { ObservabilityOperationsDashboard } from "../../src/features/observability/observability-operations-dashboard";
import { loadObservabilityOverview } from "../../src/server/observability-api";
import { requireOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";

export default async function ObservabilityPage() {
  const session = await requireOperatorSession();
  const overview = await loadObservabilityOverview(session.oidc.accessToken);

  return (
    <ControlPlaneShell
      active="/observability"
      principal={session.principal}
      environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}
    >
      <ObservabilityOperationsDashboard overview={overview}/>
    </ControlPlaneShell>
  );
}
