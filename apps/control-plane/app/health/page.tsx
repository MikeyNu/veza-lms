import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { ServiceHealth } from "../../src/features/health/service-health";
import { loadServiceHealth } from "../../src/server/service-health-api";
import { requireOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";

export default async function ServiceHealthPage() {
  const [session, snapshot] = await Promise.all([requireOperatorSession(), loadServiceHealth()]);
  return <ControlPlaneShell active="/health" principal={session.principal} environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}><ServiceHealth snapshot={snapshot}/></ControlPlaneShell>;
}
