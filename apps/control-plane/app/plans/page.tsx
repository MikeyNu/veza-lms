import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { PlanCatalogue } from "../../src/features/plans/plan-catalogue";
import { loadPlans } from "../../src/server/plans-api";
import { requireOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const session = await requireOperatorSession();
  const plans = await loadPlans(session.oidc.accessToken);
  return <ControlPlaneShell active="/plans" principal={session.principal} environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}><PlanCatalogue plans={plans}/></ControlPlaneShell>;
}
