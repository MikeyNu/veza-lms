import { ControlPlaneShell } from "../../../src/components/control-plane-shell";
import { TenantEvidenceCompletion } from "../../../src/features/tenants/tenant-evidence-completion";
import { TenantOperationsWorkspace } from "../../../src/features/tenants/tenant-operations-workspace";
import { loadTenantOperations } from "../../../src/server/control-plane-operations-api";
import { requireOperatorSession } from "../../../src/server/operator-session";

export const dynamic = "force-dynamic";

export default async function TenantOperationsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const session = await requireOperatorSession();
  const detail = await loadTenantOperations(session.oidc.accessToken, tenantId);

  return (
    <ControlPlaneShell
      active="/tenants"
      principal={session.principal}
      environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}
    >
      <TenantOperationsWorkspace detail={detail}/>
      <TenantEvidenceCompletion detail={detail}/>
    </ControlPlaneShell>
  );
}
